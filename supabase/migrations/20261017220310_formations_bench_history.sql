-- Compatible backfill: each existing board becomes a container with Original.
create table public.formations (
 id uuid primary key default gen_random_uuid(), board_id uuid not null references public.boards on delete cascade,
 name text not null check(length(trim(name)) between 1 and 60),
 orientation text not null check(orientation in ('vertical','horizontal')),
 players_per_team smallint not null check(players_per_team in (7,11)),
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,board_id)
);
create index formations_board on public.formations(board_id,created_at,id);
alter table public.formations enable row level security;
revoke all on public.formations from public,anon,authenticated;
grant select on public.formations to authenticated;
create policy formation_read on public.formations for select to authenticated using(private.is_member(board_id));
insert into public.formations(board_id,name,orientation,players_per_team)
 select id,'Original',orientation,players_per_team from public.boards;

alter table public.players add column formation_id uuid;
alter table public.players add column placement text not null default 'field' check(placement in ('field','bench'));
update public.players p set formation_id=f.id from public.formations f where f.board_id=p.board_id;
alter table public.players alter column formation_id set not null;
alter table public.players add constraint players_formation_board foreign key(formation_id,board_id) references public.formations(id,board_id) on delete cascade;
create index players_formation_team on public.players(formation_id,team,placement);

alter table private.team_numbers add column formation_id uuid;
update private.team_numbers n set formation_id=f.id from public.formations f where f.board_id=n.board_id;
alter table private.team_numbers alter column formation_id set not null;
alter table private.team_numbers drop constraint team_numbers_pkey;
alter table private.team_numbers add primary key(formation_id,team);
alter table private.team_numbers add constraint numbers_formation_board foreign key(formation_id,board_id) references public.formations(id,board_id) on delete cascade;

create table private.player_state (
 player_id uuid primary key, board_id uuid not null references public.boards on delete cascade,
 formation_id uuid not null references public.formations on delete cascade,
 revision integer not null, head uuid
);
create index player_state_formation on private.player_state(formation_id);
insert into private.player_state select id,board_id,formation_id,version,null from public.players;
create table private.player_operations (
 id uuid primary key, board_id uuid not null references public.boards on delete cascade,
 formation_id uuid not null references public.formations on delete cascade,
 actor_id uuid not null references auth.users on delete cascade, player_id uuid not null,
 type text not null, before_data jsonb, after_data jsonb, before_head uuid,
 status text not null default 'applied' check(status in ('applied','undone','invalidated')),
 created_at timestamptz not null default clock_timestamp()
);
create index operations_actor_formation on private.player_operations(actor_id,formation_id,created_at desc);
create index operations_board on private.player_operations(board_id);
create index player_state_board on private.player_state(board_id);
alter table private.player_state enable row level security;
alter table private.player_operations enable row level security;
revoke all on private.player_state,private.player_operations from public,anon,authenticated;

create function private.original_formation(p_board uuid) returns uuid language sql stable security definer set search_path='' as $$
 select id from public.formations where board_id=p_board and private.is_member(p_board) order by created_at,id limit 1;
$$;
revoke all on function private.original_formation(uuid) from public,anon;
grant execute on function private.original_formation(uuid) to authenticated;
create function private.seed_formation() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.formations(board_id,name,orientation,players_per_team) values(new.id,'Original',new.orientation,new.players_per_team);
 return new;
end $$;
revoke all on function private.seed_formation() from public,anon,authenticated;
create trigger seed_board_formation after insert on public.boards for each row execute function private.seed_formation();

create or replace function private.validate_team_capacity() returns trigger language plpgsql security invoker set search_path='' as $$
declare capacity integer;
begin
 perform 1 from public.boards where id=new.board_id for update;
 select players_per_team into capacity from public.formations where id=new.formation_id and board_id=new.board_id;
 if capacity is null then raise exception 'La formación ya no existe.'; end if;
 if tg_op='UPDATE' then
  if new.board_id<>old.board_id or new.formation_id<>old.formation_id then raise exception 'No se puede trasladar un jugador a otra formación.'; end if;
  if new.team=old.team and new.placement=old.placement then return new; end if;
 end if;
 if tg_op='INSERT' and (select count(*) from public.players where formation_id=new.formation_id)>=40 then raise exception 'Máximo: 40 jugadores entre titulares y suplentes por formación.'; end if;
 if new.placement='field' and (select count(*) from public.players where formation_id=new.formation_id and team=new.team and placement='field' and id<>new.id)>=capacity then
  raise exception 'El equipo % ya tiene % jugadores en cancha. Enviá un titular al banco para hacer lugar.',new.team,capacity;
 end if;
 return new;
end $$;

create function private.formation_snapshot(p_board uuid,p_formation uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'board',to_jsonb(b)||jsonb_build_object('orientation',f.orientation,'players_per_team',f.players_per_team),
  'formation',to_jsonb(f),
  'formations',(select jsonb_agg(g order by g.created_at,g.id) from public.formations g where g.board_id=b.id),
  'players',coalesce((select jsonb_agg(p order by p.created_at,p.id) from public.players p where p.formation_id=f.id),'[]'::jsonb),
  'locks',coalesce((select jsonb_agg(l) from private.player_locks l join public.players p on p.id=l.player_id where p.formation_id=f.id and l.expires_at>now()),'[]'::jsonb))
 from public.boards b cross join lateral (
  select * from public.formations where board_id=b.id order by (id=p_formation) desc nulls last,created_at,id limit 1
 ) f where b.id=p_board and private.is_member(b.id);
$$;
create or replace function private.board_snapshot(p_board uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select private.formation_snapshot(p_board,null);
$$;
create function public.formation_snapshot(p_board uuid,p_formation uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.formation_snapshot(p_board,p_formation); $$;
revoke all on function private.formation_snapshot(uuid,uuid),public.formation_snapshot(uuid,uuid) from public,anon;
grant execute on function private.formation_snapshot(uuid,uuid),public.formation_snapshot(uuid,uuid) to authenticated;

create function private.touch_formation(p_board uuid,p_formation uuid,p_event text,p_player uuid default null) returns void
language plpgsql security invoker set search_path='' as $$
declare v integer;
begin
 update public.formations set version=version+1,updated_at=now() where id=p_formation and board_id=p_board;
 update public.boards set version=version+1,updated_at=now() where id=p_board returning version into v;
 perform realtime.send(jsonb_build_object('version',v,'formation_id',p_formation,'player_id',p_player),p_event,'board:'||p_board::text,true);
end $$;
revoke all on function private.touch_formation(uuid,uuid,text,uuid) from public,anon,authenticated;

create function private.manage_formation(p_board uuid,p_action text,p_id uuid,p_name text default null,p_source uuid default null,p_version integer default null)
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
    insert into public.players(id,board_id,formation_id,name,number,team,x,y,placement) values(new_id,p_board,p_id,copied.name,copied.number,copied.team,copied.x,copied.y,copied.placement);
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
create function public.manage_formation(p_board uuid,p_action text,p_id uuid,p_name text default null,p_source uuid default null,p_version integer default null)
returns jsonb language sql security invoker set search_path='' as $$select private.manage_formation(p_board,p_action,p_id,p_name,p_source,p_version);$$;
revoke all on function private.manage_formation(uuid,text,uuid,text,uuid,integer),public.manage_formation(uuid,text,uuid,text,uuid,integer) from public,anon;
grant execute on function private.manage_formation(uuid,text,uuid,text,uuid,integer),public.manage_formation(uuid,text,uuid,text,uuid,integer) to authenticated;

create function private.change_player_v2(p_board uuid,p_formation uuid,p_action text,p_id uuid,p_data jsonb default '{}'::jsonb,p_version integer default null,p_lease uuid default null,p_operation uuid default null)
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
    if p_action='move' then update public.players set x=(p_data->>'x')::float8,y=(p_data->>'y')::float8,placement=coalesce(p_data->>'placement',placement) where id=p_id; end if;
    delete from private.player_locks where player_id=p_id;event:='player_drag_ended';
   end if;
  elsif p_action in ('update','delete','placement') then
   if l.expires_at>now() then raise exception 'Esperá a que termine el arrastre para editar.'; end if;
   if p.version is distinct from p_version then raise exception 'El jugador cambió. Revisá sus datos y volvé a intentar.'; end if;
   if p_action='delete' then delete from public.players where id=p_id;event:='player_deleted';
   elsif p_action='placement' then
    update public.players set placement=p_data->>'placement',x=coalesce((p_data->>'x')::float8,x),y=coalesce((p_data->>'y')::float8,y) where id=p_id;event:='player_updated';
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
create function public.change_player_v2(p_board uuid,p_formation uuid,p_action text,p_id uuid,p_data jsonb default '{}'::jsonb,p_version integer default null,p_lease uuid default null,p_operation uuid default null)
returns jsonb language sql security invoker set search_path='' as $$select private.change_player_v2(p_board,p_formation,p_action,p_id,p_data,p_version,p_lease,p_operation);$$;
revoke all on function private.change_player_v2(uuid,uuid,text,uuid,jsonb,integer,uuid,uuid),public.change_player_v2(uuid,uuid,text,uuid,jsonb,integer,uuid,uuid) from public,anon;
grant execute on function private.change_player_v2(uuid,uuid,text,uuid,jsonb,integer,uuid,uuid),public.change_player_v2(uuid,uuid,text,uuid,jsonb,integer,uuid,uuid) to authenticated;

create function private.quick_add_v2(p_board uuid,p_formation uuid,p_id uuid,p_team text,p_x double precision,p_y double precision,p_placement text default 'field')
returns jsonb language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if not private.is_member(p_board) then raise exception 'No tenés acceso a este tablero.'; end if;
 perform 1 from public.boards where id=p_board for update;
 if exists(select 1 from private.player_operations where id=p_id) then return private.change_player_v2(p_board,p_formation,'add',p_id,'{}',null,null,p_id); end if;
 if p_team is null or p_team not in ('A','B') then raise exception 'Elegí un equipo válido.'; end if;
 if not exists(select 1 from public.players where formation_id=p_formation and team=p_team) then n:=1;
 else select coalesce((select last_number from private.team_numbers where formation_id=p_formation and team=p_team),0)+1 into n; end if;
 if n>99 then raise exception 'Este equipo llegó al número 99.'; end if;
 insert into private.team_numbers(board_id,team,last_number,formation_id) values(p_board,p_team,n,p_formation)
 on conflict(formation_id,team) do update set last_number=excluded.last_number;
 return private.change_player_v2(p_board,p_formation,'add',p_id,jsonb_build_object('name','Jugador '||n,'number',n,'team',p_team,'x',p_x,'y',p_y,'placement',p_placement),null,null,p_id);
end $$;
create function public.quick_add_v2(p_board uuid,p_formation uuid,p_id uuid,p_team text,p_x double precision,p_y double precision,p_placement text default 'field') returns jsonb
language sql security invoker set search_path='' as $$select private.quick_add_v2(p_board,p_formation,p_id,p_team,p_x,p_y,p_placement);$$;
revoke all on function private.quick_add_v2(uuid,uuid,uuid,text,double precision,double precision,text),public.quick_add_v2(uuid,uuid,uuid,text,double precision,double precision,text) from public,anon;
grant execute on function private.quick_add_v2(uuid,uuid,uuid,text,double precision,double precision,text),public.quick_add_v2(uuid,uuid,uuid,text,double precision,double precision,text) to authenticated;

create function private.reverse_operation(p_board uuid,p_formation uuid,p_operation uuid,p_direction text) returns jsonb
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
  update public.players set name=target->>'name',number=(target->>'number')::integer,team=target->>'team',x=(target->>'x')::float8,y=(target->>'y')::float8,placement=target->>'placement',version=v,updated_at=now() where id=op.player_id;
 else
  insert into public.players(id,board_id,formation_id,name,number,team,x,y,placement,version,created_at)
   values(op.player_id,p_board,p_formation,target->>'name',(target->>'number')::integer,target->>'team',(target->>'x')::float8,(target->>'y')::float8,target->>'placement',v,(target->>'created_at')::timestamptz);
 end if;
 update private.player_state set revision=v,head=case when p_direction='undo' then op.before_head else op.id end where player_id=op.player_id;
 update private.player_operations set status=case when p_direction='undo' then 'undone' else 'applied' end where id=op.id;
 perform private.touch_formation(p_board,p_formation,'player_updated',op.player_id);
 return private.formation_snapshot(p_board,p_formation);
end $$;
create function public.reverse_operation(p_board uuid,p_formation uuid,p_operation uuid,p_direction text) returns jsonb language sql security invoker set search_path='' as $$select private.reverse_operation(p_board,p_formation,p_operation,p_direction);$$;
revoke all on function private.reverse_operation(uuid,uuid,uuid,text),public.reverse_operation(uuid,uuid,uuid,text) from public,anon;
grant execute on function private.reverse_operation(uuid,uuid,uuid,text),public.reverse_operation(uuid,uuid,uuid,text) to authenticated;

create function private.change_settings_v2(p_board uuid,p_formation uuid,p_name text,p_orientation text,p_format integer,p_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.formations;
begin
 if not private.is_member(p_board) then raise exception 'No tenés acceso a este tablero.'; end if;
 perform 1 from public.boards where id=p_board for update;
 if (select version from public.boards where id=p_board) is distinct from p_version then raise exception 'El tablero cambió. Revisalo y volvé a intentar.'; end if;
 select * into f from public.formations where id=p_formation and board_id=p_board;
 if not found then raise exception 'La formación ya no existe.'; end if;
 if p_format is null or p_format not in (7,11) then raise exception 'Elegí fútbol 7 o fútbol 11.'; end if;
 if p_format<>f.players_per_team then
  if exists(select 1 from public.players where formation_id=f.id) then raise exception 'Hay una formación pendiente. Vaciá la cancha y el banco antes de cambiar de formato.'; end if;
  delete from private.team_numbers where formation_id=f.id;
 end if;
 update public.boards set name=trim(p_name) where id=p_board;
 update public.formations set orientation=p_orientation,players_per_team=p_format where id=f.id;
 perform private.touch_formation(p_board,f.id,'board_updated');
 return private.formation_snapshot(p_board,f.id);
end $$;
create function public.change_settings_v2(p_board uuid,p_formation uuid,p_name text,p_orientation text,p_format integer,p_version integer) returns jsonb
language sql security invoker set search_path='' as $$select private.change_settings_v2(p_board,p_formation,p_name,p_orientation,p_format,p_version);$$;
revoke all on function private.change_settings_v2(uuid,uuid,text,text,integer,integer),public.change_settings_v2(uuid,uuid,text,text,integer,integer) from public,anon;
grant execute on function private.change_settings_v2(uuid,uuid,text,text,integer,integer),public.change_settings_v2(uuid,uuid,text,text,integer,integer) to authenticated;

-- Compatibility for existing URLs and clients; new clients always supply a formation.
create or replace function private.change_player(p_board uuid,p_action text,p_id uuid,p_data jsonb default '{}'::jsonb,p_version integer default null,p_lease uuid default null)
returns jsonb language sql security definer set search_path='' as $$
 select private.change_player_v2(p_board,coalesce((select formation_id from public.players where id=p_id and board_id=p_board),private.original_formation(p_board)),p_action,p_id,p_data,p_version,p_lease,null);
$$;
create or replace function private.quick_add_player(p_board uuid,p_id uuid,p_team text,p_x double precision,p_y double precision) returns jsonb
language sql security definer set search_path='' as $$select private.quick_add_v2(p_board,private.original_formation(p_board),p_id,p_team,p_x,p_y,'field');$$;
create or replace function private.change_board(p_board uuid,p_name text,p_orientation text,p_version integer) returns jsonb
language sql security definer set search_path='' as $$select private.change_settings_v2(p_board,private.original_formation(p_board),p_name,p_orientation,(select players_per_team from public.formations where id=private.original_formation(p_board)),p_version);$$;
create or replace function private.change_format(p_board uuid,p_format integer,p_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f uuid:=private.original_formation(p_board);
begin
 if not private.is_member(p_board) then raise exception 'No tenés acceso a este tablero.'; end if;
 if p_format is null or p_format not in (7,11) then raise exception 'Elegí fútbol 7 o fútbol 11.'; end if;
 if (select players_per_team from public.formations where id=f)=p_format then return private.formation_snapshot(p_board,f); end if;
 return private.change_settings_v2(p_board,f,(select name from public.boards where id=p_board),(select orientation from public.formations where id=f),p_format,p_version);
end $$;
