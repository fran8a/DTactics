-- Preserve the last field position separately from the position outside the lines.
alter table public.players add column outside_x double precision;
alter table public.players add column outside_y double precision;
alter table public.players add constraint players_outside_position check (
 (outside_x is null and outside_y is null) or
 (outside_x is not null and outside_y is not null and outside_x between -1 and 2 and outside_y between -1 and 2
 and (outside_x<0 or outside_x>1 or outside_y<0 or outside_y>1))
);

create or replace function private.manage_formation(p_board uuid,p_action text,p_id uuid,p_name text default null,p_source uuid default null,p_version integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.formations; source public.formations; selected uuid; copied public.players; new_id uuid;
begin
 if not private.is_member(p_board) then raise exception 'No tenés acceso a este tablero.'; end if;
 perform 1 from public.boards where id=p_board for update;
 if p_action in ('create','duplicate') then
  if exists(select 1 from public.formations where id=p_id and board_id=p_board) then return private.formation_snapshot(p_board,p_id); end if;
  if (select count(*) from public.formations where board_id=p_board)>=12 then raise exception 'Máximo: 12 formaciones por tablero.'; end if;
  select * into source from public.formations where id=coalesce(p_source,private.original_formation(p_board)) and board_id=p_board;
  if not found then raise exception 'La formación de origen ya no existe.'; end if;
  if p_action='duplicate' and exists(select 1 from private.player_locks l join public.players p on p.id=l.player_id where p.formation_id=source.id and l.expires_at>now()) then raise exception 'Esperá a que terminen los arrastres antes de duplicar.'; end if;
  insert into public.formations(id,board_id,name,orientation,players_per_team) values(p_id,p_board,coalesce(nullif(trim(p_name),''),case when p_action='duplicate' then left('Copia de '||source.name,60) else 'Nueva formación' end),source.orientation,source.players_per_team);
  if p_action='duplicate' then
   for copied in select * from public.players where formation_id=source.id loop
    new_id:=gen_random_uuid();
    insert into public.players(id,board_id,formation_id,name,number,team,x,y,placement,outside_x,outside_y) values(new_id,p_board,p_id,copied.name,copied.number,copied.team,copied.x,copied.y,copied.placement,copied.outside_x,copied.outside_y);
    insert into private.player_state values(new_id,p_board,p_id,1,null);
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

create or replace function private.change_player_v2(p_board uuid,p_formation uuid,p_action text,p_id uuid,p_data jsonb default '{}'::jsonb,p_version integer default null,p_lease uuid default null,p_operation uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.players; l private.player_locks; state private.player_state; prior jsonb; resulting jsonb;
 event text; op uuid:=coalesce(p_operation,gen_random_uuid()); existing private.player_operations; revision integer;
begin
 if not private.is_member(p_board) then raise exception 'No tenés acceso a este tablero.'; end if;
 perform 1 from public.boards where id=p_board for update;
 if not exists(select 1 from public.formations where id=p_formation and board_id=p_board) then raise exception 'La formación ya no existe en este tablero.'; end if;
 select * into existing from private.player_operations where id=op;
 if found then
  if existing.actor_id<>auth.uid() or existing.formation_id<>p_formation or existing.player_id<>p_id then raise exception 'Identificador de operación inválido.'; end if;
  return private.formation_snapshot(p_board,p_formation)||jsonb_build_object('operation',to_jsonb(existing));
 end if;
 select * into p from public.players where id=p_id and formation_id=p_formation and board_id=p_board;
 prior:=case when p.id is null then null else to_jsonb(p) end;
 if p_action='add' then
  if p.id is not null then return private.formation_snapshot(p_board,p_formation); end if;
  if exists(select 1 from private.player_state where player_id=p_id) then raise exception 'Este identificador ya fue utilizado. Volvé a agregar el jugador.'; end if;
  insert into public.players(id,board_id,formation_id,name,number,team,x,y,placement)
   values(p_id,p_board,p_formation,trim(p_data->>'name'),(p_data->>'number')::integer,p_data->>'team',(p_data->>'x')::float8,(p_data->>'y')::float8,coalesce(p_data->>'placement','field'));
  insert into private.player_state values(p_id,p_board,p_formation,1,null);
  event:='player_added';
 else
  if p.id is null then
   if p_action in ('delete','release') then return private.formation_snapshot(p_board,p_formation); end if;
   raise exception 'El jugador ya no está en esta formación.';
  end if;
  select * into l from private.player_locks where player_id=p_id;
  if p_action='acquire' then
   if p_lease is null then raise exception 'Falta el identificador del arrastre.'; end if;
   if l.expires_at>now() and (l.user_id<>auth.uid() or l.lease_id<>p_lease) then raise exception 'Otro participante está moviendo este jugador.'; end if;
   insert into private.player_locks values(p_id,auth.uid(),p_lease,now()+interval '12 seconds') on conflict(player_id) do update set user_id=excluded.user_id,lease_id=excluded.lease_id,expires_at=excluded.expires_at;
   event:='player_drag_started';
  elsif p_action in ('renew','move','release') then
   if l.user_id is distinct from auth.uid() or l.lease_id is distinct from p_lease or l.expires_at<=now() then
    if p_action='release' then return private.formation_snapshot(p_board,p_formation); end if;
    raise exception 'El bloqueo expiró. Volvé a intentar el movimiento.';
   end if;
   if p_action='renew' then update private.player_locks set expires_at=now()+interval '12 seconds' where player_id=p_id;event:='player_drag_started';
   else
    if p_action='move' then update public.players set x=(p_data->>'x')::float8,y=(p_data->>'y')::float8,placement=coalesce(p_data->>'placement',placement),outside_x=coalesce((p_data->>'outside_x')::float8,outside_x),outside_y=coalesce((p_data->>'outside_y')::float8,outside_y) where id=p_id; end if;
    delete from private.player_locks where player_id=p_id;event:='player_drag_ended';
   end if;
  elsif p_action in ('update','delete','placement') then
   if l.expires_at>now() then raise exception 'Esperá a que termine el arrastre para editar.'; end if;
   if p.version is distinct from p_version then raise exception 'El jugador cambió. Revisá sus datos y volvé a intentar.'; end if;
   if p_action='delete' then delete from public.players where id=p_id;event:='player_deleted';
   elsif p_action='placement' then
    update public.players set placement=p_data->>'placement',x=coalesce((p_data->>'x')::float8,x),y=coalesce((p_data->>'y')::float8,y),outside_x=coalesce((p_data->>'outside_x')::float8,outside_x),outside_y=coalesce((p_data->>'outside_y')::float8,outside_y) where id=p_id;event:='player_updated';
   else update public.players set name=trim(p_data->>'name'),number=(p_data->>'number')::integer,team=p_data->>'team' where id=p_id;event:='player_updated';
   end if;
  else raise exception 'Operación inválida.';
  end if;
 end if;
 if p_action not in ('acquire','renew','release') then
  select * into state from private.player_state where player_id=p_id for update;
  revision:=case when p_action='add' then 1 else state.revision+1 end;
  update public.players set version=revision,updated_at=now() where id=p_id;
  select to_jsonb(r) into resulting from public.players r where id=p_id;
  update private.player_operations set status='invalidated' where actor_id=auth.uid() and formation_id=p_formation and status='undone';
  insert into private.player_operations(id,board_id,formation_id,actor_id,player_id,type,before_data,after_data,before_head)
   values(op,p_board,p_formation,auth.uid(),p_id,p_action,prior,resulting,state.head) returning * into existing;
  update private.player_state s set revision=case when p_action='add' then 1 else state.revision+1 end,head=op where s.player_id=p_id;
  delete from private.player_operations where actor_id=auth.uid() and formation_id=p_formation and id not in (
   select id from private.player_operations where actor_id=auth.uid() and formation_id=p_formation order by created_at desc,id desc limit 50);
 end if;
 perform private.touch_formation(p_board,p_formation,event,p_id);
 return private.formation_snapshot(p_board,p_formation)||case when existing.id is null then '{}'::jsonb else jsonb_build_object('operation',to_jsonb(existing)) end;
end $$;

create or replace function private.reverse_operation(p_board uuid,p_formation uuid,p_operation uuid,p_direction text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare op private.player_operations; s private.player_state; target jsonb; v integer; expected uuid;
begin
 if not private.is_member(p_board) then raise exception 'No tenés acceso a este tablero.'; end if;
 perform 1 from public.boards where id=p_board for update;
 select * into op from private.player_operations where id=p_operation and board_id=p_board and formation_id=p_formation and actor_id=auth.uid() for update;
 if not found then raise exception 'La operación ya no está disponible en tu historial.'; end if;
 if p_direction not in ('undo','redo') or p_direction is null then raise exception 'Operación de historial inválida.'; end if;
 if op.status='invalidated' then raise exception 'Se descartó la rama de rehacer al realizar una nueva acción.'; end if;
 if (p_direction='undo' and op.status='undone') or (p_direction='redo' and op.status='applied') then return private.formation_snapshot(p_board,p_formation); end if;
 select * into s from private.player_state where player_id=op.player_id for update;
 expected:=case when p_direction='undo' then op.id else op.before_head end;
 if s.head is distinct from expected then raise exception 'No se puede revertir: este jugador recibió cambios posteriores. No se modificó el tablero.'; end if;
 if exists(select 1 from private.player_locks where player_id=op.player_id and expires_at>now()) then raise exception 'Esperá a que termine el arrastre para deshacer o rehacer.'; end if;
 target:=case when p_direction='undo' then op.before_data else op.after_data end;
 v:=s.revision+1;
 if target is null then delete from public.players where id=op.player_id;
 elsif exists(select 1 from public.players where id=op.player_id) then
  update public.players set name=target->>'name',number=(target->>'number')::integer,team=target->>'team',x=(target->>'x')::float8,y=(target->>'y')::float8,placement=target->>'placement',outside_x=(target->>'outside_x')::float8,outside_y=(target->>'outside_y')::float8,version=v,updated_at=now() where id=op.player_id;
 else
  insert into public.players(id,board_id,formation_id,name,number,team,x,y,placement,version,created_at,outside_x,outside_y)
   values(op.player_id,p_board,p_formation,target->>'name',(target->>'number')::integer,target->>'team',(target->>'x')::float8,(target->>'y')::float8,target->>'placement',v,(target->>'created_at')::timestamptz,(target->>'outside_x')::float8,(target->>'outside_y')::float8);
 end if;
 update private.player_state set revision=v,head=case when p_direction='undo' then op.before_head else op.id end where player_id=op.player_id;
 update private.player_operations set status=case when p_direction='undo' then 'undone' else 'applied' end where id=op.id;
 perform private.touch_formation(p_board,p_formation,'player_updated',op.player_id);
 return private.formation_snapshot(p_board,p_formation);
end $$;
