-- Speeds are keyed by field-player UUID, like routes. Missing entries mean x1.
alter table private.tactical_state add column speeds jsonb not null default '{}'::jsonb
  check(jsonb_typeof(speeds)='object');

create or replace function private.clean_player_tactics() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' or new.placement='bench' then
    update private.tactical_state set routes=routes-old.id::text,speeds=speeds-old.id::text,version=version+1,head=null
      where formation_id=old.formation_id and (routes ? old.id::text or speeds ? old.id::text);
  end if;
  return null;
end $$;

-- Keep the ball snapshot and its authorization checks intact.
alter function private.formation_snapshot(uuid,uuid) rename to formation_snapshot_without_speeds;
revoke all on function private.formation_snapshot_without_speeds(uuid,uuid) from public,anon,authenticated;
create function private.formation_snapshot(p_board uuid,p_formation uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s jsonb; v_speeds jsonb;
begin
  s:=private.formation_snapshot_without_speeds(p_board,p_formation);
  if s is null then return null; end if;
  select speeds into v_speeds from private.tactical_state where formation_id=(s->'formation'->>'id')::uuid;
  return jsonb_set(s,'{tactics,speeds}',coalesce(v_speeds,'{}'::jsonb));
end $$;
revoke all on function private.formation_snapshot(uuid,uuid) from public,anon;
grant execute on function private.formation_snapshot(uuid,uuid) to authenticated;

create function private.validate_tactics(p_board uuid,p_formation uuid,p_routes jsonb,p_duration integer,p_speeds jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare entry record;
begin
  perform private.validate_tactics(p_board,p_formation,p_routes,p_duration);
  if p_speeds is null or jsonb_typeof(p_speeds)<>'object' then raise exception 'Las velocidades no son válidas.'; end if;
  if (select count(*) from jsonb_object_keys(p_speeds))>22 then raise exception 'Máximo: una velocidad por titular.'; end if;
  for entry in select * from jsonb_each(p_speeds) loop
    if not exists(select 1 from public.players where id::text=entry.key and board_id=p_board and formation_id=p_formation and placement='field') then
      raise exception 'Solo los titulares de esta formación pueden tener velocidades.';
    end if;
    if jsonb_typeof(entry.value)<>'number' then raise exception 'La velocidad debe ser 0.5, 0.75, 1, 1.5 o 2.'; end if;
    if (entry.value::text)::numeric not in (0.5,0.75,1,1.5,2) then raise exception 'La velocidad debe ser 0.5, 0.75, 1, 1.5 o 2.'; end if;
  end loop;
end $$;
revoke all on function private.validate_tactics(uuid,uuid,jsonb,integer,jsonb) from public,anon,authenticated;

-- A trailing optional argument keeps older clients working, preserving speeds
-- when they edit only routes or duration. Versions still protect concurrent edits.
drop function public.edit_tactics(uuid,uuid,jsonb,integer,integer,uuid);
drop function private.edit_tactics(uuid,uuid,jsonb,integer,integer,uuid);
create function private.edit_tactics(p_board uuid,p_formation uuid,p_routes jsonb,p_duration_ms integer,p_version integer,p_operation uuid,p_speeds jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t private.tactical_state; op private.tactical_operations; prior jsonb; next_data jsonb; next_speeds jsonb;
begin
  if not private.is_member(p_board) then raise exception 'No tenés acceso a este tablero.'; end if;
  perform 1 from public.boards where id=p_board for update;
  if p_operation is null then raise exception 'Falta el identificador de la operación.'; end if;
  select * into op from private.tactical_operations where id=p_operation;
  if found then
    if op.actor_id<>auth.uid() or op.formation_id<>p_formation or op.board_id<>p_board then raise exception 'Identificador de operación inválido.'; end if;
    return private.formation_snapshot(p_board,p_formation)||jsonb_build_object('operation',to_jsonb(op)||jsonb_build_object('kind','tactics','type','tactics','player_id',p_formation));
  end if;
  select * into t from private.tactical_state where formation_id=p_formation and board_id=p_board for update;
  if not found then raise exception 'La formación ya no existe.'; end if;
  if t.version is distinct from p_version then raise exception 'La jugada cambió. Recargá el recorrido y volvé a intentar.'; end if;
  if exists(select 1 from private.player_locks l join public.players p on p.id=l.player_id where p.formation_id=p_formation and l.expires_at>now()) then
    raise exception 'Esperá a que terminen los arrastres para editar la jugada.';
  end if;
  next_speeds:=coalesce(p_speeds,t.speeds);
  perform private.validate_tactics(p_board,p_formation,p_routes,p_duration_ms,next_speeds);
  if t.routes=p_routes and t.duration_ms=p_duration_ms and t.speeds=next_speeds then return private.formation_snapshot(p_board,p_formation); end if;
  prior:=jsonb_build_object('routes',t.routes,'duration_ms',t.duration_ms,'speeds',t.speeds);
  next_data:=jsonb_build_object('routes',p_routes,'duration_ms',p_duration_ms,'speeds',next_speeds);
  update private.tactical_operations set status='invalidated' where actor_id=auth.uid() and formation_id=p_formation and status='undone';
  insert into private.tactical_operations(id,board_id,formation_id,actor_id,before_data,after_data,before_head)
    values(p_operation,p_board,p_formation,auth.uid(),prior,next_data,t.head) returning * into op;
  update private.tactical_state set routes=p_routes,speeds=next_speeds,duration_ms=p_duration_ms,version=version+1,head=op.id where formation_id=p_formation;
  delete from private.tactical_operations where actor_id=auth.uid() and formation_id=p_formation and id not in (
    select id from private.tactical_operations where actor_id=auth.uid() and formation_id=p_formation order by created_at desc,id desc limit 50);
  perform private.touch_formation(p_board,p_formation,'tactics_updated');
  return private.formation_snapshot(p_board,p_formation)||jsonb_build_object('operation',to_jsonb(op)||jsonb_build_object('kind','tactics','type','tactics','player_id',p_formation));
end $$;

create or replace function private.reverse_tactics_operation(p_board uuid,p_formation uuid,p_operation uuid,p_direction text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare op private.tactical_operations; t private.tactical_state; target jsonb; expected uuid;
begin
  if not private.is_member(p_board) then raise exception 'No tenés acceso a este tablero.'; end if;
  perform 1 from public.boards where id=p_board for update;
  if p_direction is null or p_direction not in ('undo','redo') then raise exception 'Operación de historial inválida.'; end if;
  select * into op from private.tactical_operations where id=p_operation and board_id=p_board and formation_id=p_formation and actor_id=auth.uid() for update;
  if not found then raise exception 'La operación ya no está disponible en tu historial.'; end if;
  if op.status='invalidated' then raise exception 'Se descartó la rama de rehacer al realizar una nueva acción.'; end if;
  if (p_direction='undo' and op.status='undone') or (p_direction='redo' and op.status='applied') then return private.formation_snapshot(p_board,p_formation); end if;
  select * into t from private.tactical_state where formation_id=p_formation for update;
  expected:=case when p_direction='undo' then op.id else op.before_head end;
  if t.head is distinct from expected then raise exception 'No se puede revertir: la jugada recibió cambios posteriores.'; end if;
  if exists(select 1 from private.player_locks l join public.players p on p.id=l.player_id where p.formation_id=p_formation and l.expires_at>now()) then raise exception 'Esperá a que termine el arrastre para deshacer o rehacer.'; end if;
  target:=case when p_direction='undo' then op.before_data else op.after_data end;
  perform private.validate_tactics(p_board,p_formation,target->'routes',(target->>'duration_ms')::integer,coalesce(target->'speeds','{}'::jsonb));
  update private.tactical_state set routes=target->'routes',speeds=coalesce(target->'speeds','{}'::jsonb),duration_ms=(target->>'duration_ms')::integer,version=version+1,
    head=case when p_direction='undo' then op.before_head else op.id end where formation_id=p_formation;
  update private.tactical_operations set status=case when p_direction='undo' then 'undone' else 'applied' end where id=op.id;
  perform private.touch_formation(p_board,p_formation,'tactics_updated');
  return private.formation_snapshot(p_board,p_formation);
end $$;

create function public.edit_tactics(p_board uuid,p_formation uuid,p_routes jsonb,p_duration_ms integer,p_version integer,p_operation uuid,p_speeds jsonb default null) returns jsonb
language sql security invoker set search_path='' as $$select private.edit_tactics(p_board,p_formation,p_routes,p_duration_ms,p_version,p_operation,p_speeds);$$;
revoke all on function private.edit_tactics(uuid,uuid,jsonb,integer,integer,uuid,jsonb),public.edit_tactics(uuid,uuid,jsonb,integer,integer,uuid,jsonb) from public,anon;
grant execute on function private.edit_tactics(uuid,uuid,jsonb,integer,integer,uuid,jsonb),public.edit_tactics(uuid,uuid,jsonb,integer,integer,uuid,jsonb) to authenticated;

-- Extend the original UUID copy loop; the outer manage_formation wrapper
-- continues to preserve the ball and its active-drag checks.
create or replace function private.manage_formation_without_ball(p_board uuid,p_action text,p_id uuid,p_name text default null,p_source uuid default null,p_version integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.formations; source public.formations; selected uuid; copied public.players; new_id uuid;
begin
 if not private.is_member(p_board) then raise exception 'No tenés acceso a este tablero.'; end if;
 perform 1 from public.boards where id=p_board for update;
 if p_action in ('create','duplicate') then
  if exists(select 1 from public.formations where id=p_id and board_id=p_board) then return private.formation_snapshot(p_board,p_id); end if;
  if (select count(*) from public.formations where board_id=p_board)>=5 then raise exception 'Máximo: 5 formaciones por tablero.'; end if;
  select * into source from public.formations where id=coalesce(p_source,private.original_formation(p_board)) and board_id=p_board;
  if not found then raise exception 'La formación de origen ya no existe.'; end if;
  if p_action='duplicate' and exists(select 1 from private.player_locks l join public.players p on p.id=l.player_id where p.formation_id=source.id and l.expires_at>now()) then raise exception 'Esperá a que terminen los arrastres antes de duplicar.'; end if;
  insert into public.formations(id,board_id,name,orientation,players_per_team) values(p_id,p_board,coalesce(nullif(trim(p_name),''),case when p_action='duplicate' then left('Copia de '||source.name,60) else 'Nueva formación' end),source.orientation,source.players_per_team);
  if p_action='duplicate' then
   update private.tactical_state set duration_ms=(select duration_ms from private.tactical_state where formation_id=source.id) where formation_id=p_id;
   for copied in select * from public.players where formation_id=source.id loop
    new_id:=gen_random_uuid();
    insert into public.players(id,board_id,formation_id,name,number,team,x,y,placement,outside_x,outside_y) values(new_id,p_board,p_id,copied.name,copied.number,copied.team,copied.x,copied.y,copied.placement,copied.outside_x,copied.outside_y);
    insert into private.player_state values(new_id,p_board,p_id,1,null);
    update private.tactical_state set routes=routes||jsonb_build_object(new_id::text,(select routes->copied.id::text from private.tactical_state where formation_id=source.id))
     where formation_id=p_id and copied.placement='field' and exists(select 1 from private.tactical_state where formation_id=source.id and routes ? copied.id::text);
    update private.tactical_state set speeds=speeds||jsonb_build_object(new_id::text,(select speeds->copied.id::text from private.tactical_state where formation_id=source.id))
     where formation_id=p_id and copied.placement='field' and exists(select 1 from private.tactical_state where formation_id=source.id and speeds ? copied.id::text);
   end loop;
   insert into private.team_numbers(board_id,team,last_number,formation_id) select p_board,team,last_number,p_id from private.team_numbers where formation_id=source.id;
  end if;
  selected:=p_id;
 elsif p_action in ('rename','delete') then
  select * into f from public.formations where id=p_id and board_id=p_board;
  if not found then raise exception 'La formación ya no existe.'; end if;
  if f.version is distinct from p_version then raise exception 'La formación cambió. Revisala y volvé a intentar.'; end if;
  if p_action='rename' then update public.formations set name=trim(p_name) where id=p_id;selected:=p_id;
  else
   if (select count(*) from public.formations where board_id=p_board)<=1 then raise exception 'No podés eliminar la última formación del tablero.'; end if;
   delete from public.formations where id=p_id;
   selected:=private.original_formation(p_board);
  end if;
 else raise exception 'Operación de formación inválida.';
 end if;
 perform private.touch_formation(p_board,p_id,'formation_updated');
 return private.formation_snapshot(p_board,selected);
end $$;

notify pgrst,'reload schema';
