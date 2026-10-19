-- Private, bounded configuration; snapshots expose it only to board members.
create table private.tactical_state (
  formation_id uuid primary key,
  board_id uuid not null references public.boards(id) on delete cascade,
  routes jsonb not null default '{}'::jsonb check(jsonb_typeof(routes)='object'),
  duration_ms integer not null default 5000 check(duration_ms between 1000 and 30000),
  version integer not null default 1,
  head uuid,
  foreign key(formation_id,board_id) references public.formations(id,board_id) on delete cascade
);
create index tactical_state_board on private.tactical_state(board_id);
create table private.tactical_operations (
  id uuid primary key,
  board_id uuid not null references public.boards(id) on delete cascade,
  formation_id uuid not null references public.formations(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  before_data jsonb not null, after_data jsonb not null, before_head uuid,
  status text not null default 'applied' check(status in ('applied','undone','invalidated')),
  created_at timestamptz not null default clock_timestamp()
);
create index tactical_operations_board on private.tactical_operations(board_id);
create index tactical_operations_actor on private.tactical_operations(actor_id,formation_id,created_at desc,id);
alter table private.tactical_state enable row level security;
alter table private.tactical_operations enable row level security;
revoke all on private.tactical_state,private.tactical_operations from public,anon,authenticated;
insert into private.tactical_state(formation_id,board_id) select id,board_id from public.formations;

create function private.seed_tactics() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into private.tactical_state(formation_id,board_id) values(new.id,new.board_id);
  return new;
end $$;
revoke all on function private.seed_tactics() from public,anon,authenticated;
create trigger seed_formation_tactics after insert on public.formations for each row execute function private.seed_tactics();

create function private.clean_player_tactics() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' or new.placement='bench' then
    update private.tactical_state set routes=routes-old.id::text,version=version+1,head=null
      where formation_id=old.formation_id and routes ? old.id::text;
  end if;
  return null;
end $$;
revoke all on function private.clean_player_tactics() from public,anon,authenticated;
create trigger clean_player_tactics after delete or update of placement on public.players
  for each row execute function private.clean_player_tactics();

-- Preserve the existing snapshot/authorization implementation.
alter function private.formation_snapshot(uuid,uuid) rename to formation_snapshot_without_tactics;
revoke all on function private.formation_snapshot_without_tactics(uuid,uuid) from public,anon,authenticated;
create function private.formation_snapshot(p_board uuid,p_formation uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s jsonb; t private.tactical_state;
begin
  s:=private.formation_snapshot_without_tactics(p_board,p_formation);
  if s is null then return null; end if;
  select * into t from private.tactical_state where formation_id=(s->'formation'->>'id')::uuid;
  return s||jsonb_build_object('tactics',jsonb_build_object('routes',coalesce(t.routes,'{}'::jsonb),
    'duration_ms',coalesce(t.duration_ms,5000),'version',coalesce(t.version,1)));
end $$;
revoke all on function private.formation_snapshot(uuid,uuid) from public,anon;
grant execute on function private.formation_snapshot(uuid,uuid) to authenticated;

create function private.validate_tactics(p_board uuid,p_formation uuid,p_routes jsonb,p_duration integer) returns void
language plpgsql security invoker set search_path='' as $$
declare entry record; point jsonb; count_routes integer;
begin
  if p_duration is null or p_duration not between 1000 and 30000 then raise exception 'Elegí una duración de 1 a 30 segundos.'; end if;
  if p_routes is null or jsonb_typeof(p_routes)<>'object' then raise exception 'Los recorridos no son válidos.'; end if;
  select count(*) into count_routes from jsonb_object_keys(p_routes);
  if count_routes>22 then raise exception 'Máximo: un recorrido por titular.'; end if;
  for entry in select * from jsonb_each(p_routes) loop
    if not exists(select 1 from public.players where id::text=entry.key and board_id=p_board and formation_id=p_formation and placement='field') then
      raise exception 'Solo los titulares de esta formación pueden tener recorridos.';
    end if;
    if jsonb_typeof(entry.value)<>'array' then raise exception 'El recorrido no es válido.'; end if;
    if jsonb_array_length(entry.value) not between 1 and 24 then raise exception 'Cada recorrido debe tener entre 1 y 24 puntos.'; end if;
    for point in select * from jsonb_array_elements(entry.value) loop
      if jsonb_typeof(point)<>'object' or jsonb_typeof(point->'x') is distinct from 'number' or jsonb_typeof(point->'y') is distinct from 'number' then
        raise exception 'Los puntos del recorrido no son válidos.';
      end if;
      if (point->>'x')::numeric not between 0 and 1 or (point->>'y')::numeric not between 0 and 1 then
        raise exception 'Los recorridos deben permanecer dentro de la cancha.';
      end if;
      if (select count(*) from jsonb_object_keys(point))<>2 then raise exception 'Los puntos solo admiten coordenadas x e y.'; end if;
    end loop;
  end loop;
end $$;
revoke all on function private.validate_tactics(uuid,uuid,jsonb,integer) from public,anon,authenticated;

-- New actions discard the redo branch across BOTH kinds of history.
create function private.invalidate_other_history() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='player_operations' then
    update private.tactical_operations set status='invalidated' where actor_id=new.actor_id and formation_id=new.formation_id and status='undone';
  else
    update private.player_operations set status='invalidated' where actor_id=new.actor_id and formation_id=new.formation_id and status='undone';
  end if;
  return new;
end $$;
revoke all on function private.invalidate_other_history() from public,anon,authenticated;
create trigger invalidate_tactical_redo after insert on private.player_operations for each row execute function private.invalidate_other_history();
create trigger invalidate_player_redo after insert on private.tactical_operations for each row execute function private.invalidate_other_history();

create function private.edit_tactics(p_board uuid,p_formation uuid,p_routes jsonb,p_duration_ms integer,p_version integer,p_operation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t private.tactical_state; op private.tactical_operations; prior jsonb; next_data jsonb;
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
  perform private.validate_tactics(p_board,p_formation,p_routes,p_duration_ms);
  if t.routes=p_routes and t.duration_ms=p_duration_ms then return private.formation_snapshot(p_board,p_formation); end if;
  prior:=jsonb_build_object('routes',t.routes,'duration_ms',t.duration_ms);
  next_data:=jsonb_build_object('routes',p_routes,'duration_ms',p_duration_ms);
  update private.tactical_operations set status='invalidated' where actor_id=auth.uid() and formation_id=p_formation and status='undone';
  insert into private.tactical_operations(id,board_id,formation_id,actor_id,before_data,after_data,before_head)
    values(p_operation,p_board,p_formation,auth.uid(),prior,next_data,t.head) returning * into op;
  update private.tactical_state set routes=p_routes,duration_ms=p_duration_ms,version=version+1,head=op.id where formation_id=p_formation;
  delete from private.tactical_operations where actor_id=auth.uid() and formation_id=p_formation and id not in (
    select id from private.tactical_operations where actor_id=auth.uid() and formation_id=p_formation order by created_at desc,id desc limit 50);
  perform private.touch_formation(p_board,p_formation,'tactics_updated');
  return private.formation_snapshot(p_board,p_formation)||jsonb_build_object('operation',to_jsonb(op)||jsonb_build_object('kind','tactics','type','tactics','player_id',p_formation));
end $$;

create function private.reverse_tactics_operation(p_board uuid,p_formation uuid,p_operation uuid,p_direction text) returns jsonb
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
  perform private.validate_tactics(p_board,p_formation,target->'routes',(target->>'duration_ms')::integer);
  update private.tactical_state set routes=target->'routes',duration_ms=(target->>'duration_ms')::integer,version=version+1,
    head=case when p_direction='undo' then op.before_head else op.id end where formation_id=p_formation;
  update private.tactical_operations set status=case when p_direction='undo' then 'undone' else 'applied' end where id=op.id;
  perform private.touch_formation(p_board,p_formation,'tactics_updated');
  return private.formation_snapshot(p_board,p_formation);
end $$;

create function public.edit_tactics(p_board uuid,p_formation uuid,p_routes jsonb,p_duration_ms integer,p_version integer,p_operation uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.edit_tactics(p_board,p_formation,p_routes,p_duration_ms,p_version,p_operation);$$;
create function public.reverse_tactics_operation(p_board uuid,p_formation uuid,p_operation uuid,p_direction text) returns jsonb
language sql security invoker set search_path='' as $$select private.reverse_tactics_operation(p_board,p_formation,p_operation,p_direction);$$;
revoke all on function private.edit_tactics(uuid,uuid,jsonb,integer,integer,uuid),public.edit_tactics(uuid,uuid,jsonb,integer,integer,uuid),
  private.reverse_tactics_operation(uuid,uuid,uuid,text),public.reverse_tactics_operation(uuid,uuid,uuid,text) from public,anon;
grant execute on function private.edit_tactics(uuid,uuid,jsonb,integer,integer,uuid),public.edit_tactics(uuid,uuid,jsonb,integer,integer,uuid),
  private.reverse_tactics_operation(uuid,uuid,uuid,text),public.reverse_tactics_operation(uuid,uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';

-- Duplicate using the exact old/new IDs from the existing copy loop.
create or replace function private.manage_formation(p_board uuid,p_action text,p_id uuid,p_name text default null,p_source uuid default null,p_version integer default null)
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
