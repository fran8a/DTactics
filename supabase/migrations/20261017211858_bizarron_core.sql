-- All privileged implementations live outside the exposed API schema.
create schema if not exists private;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'La pizarra de los pibes' check (length(trim(name)) between 1 and 80),
  orientation text not null default 'vertical' check (orientation in ('vertical','horizontal')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version integer not null default 1
);
create table private.board_access (
  board_id uuid primary key references public.boards on delete cascade,
  token_hash bytea not null, creator uuid not null references auth.users on delete cascade
);
create index board_access_creator on private.board_access(creator);
create table private.members (
  board_id uuid references public.boards on delete cascade,
  user_id uuid references auth.users on delete cascade,
  primary key(board_id,user_id)
);
create index members_user on private.members(user_id);
create table public.players (
  id uuid primary key default gen_random_uuid(), board_id uuid not null references public.boards on delete cascade,
  name text not null check(length(trim(name)) between 1 and 40),
  number integer not null check(number between 0 and 99), team text not null check(team in ('A','B')),
  x double precision not null check(x between 0 and 1), y double precision not null check(y between 0 and 1),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1
);
create index players_board on public.players(board_id);
create table private.player_locks (
  player_id uuid primary key references public.players on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  lease_id uuid not null, expires_at timestamptz not null
);
alter table public.boards enable row level security;
alter table public.players enable row level security;
alter table private.board_access enable row level security;
alter table private.members enable row level security;
alter table private.player_locks enable row level security;
revoke all on public.boards, public.players from anon, authenticated;
grant select on public.boards, public.players to authenticated;

create function private.is_member(p_board uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from private.members where board_id=p_board and user_id=auth.uid());
$$;
revoke all on function private.is_member(uuid) from public;
grant execute on function private.is_member(uuid) to authenticated;
create policy board_read on public.boards for select to authenticated using(private.is_member(id));
create policy player_read on public.players for select to authenticated using(private.is_member(board_id));
create policy board_channel_read on realtime.messages for select to authenticated
using(extension in ('broadcast','presence') and exists(select 1 from public.boards b where 'board:' || b.id::text = realtime.topic()));
create policy board_channel_write on realtime.messages for insert to authenticated
with check(extension in ('broadcast','presence') and exists(select 1 from public.boards b where 'board:' || b.id::text = realtime.topic()));

create function private.create_board() returns jsonb language plpgsql security definer set search_path = '' as $$
declare b uuid; t text;
begin
  if auth.uid() is null then raise exception 'Necesitás una sesión.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if (select count(*) from private.board_access where creator=auth.uid()) >= 25 then raise exception 'Llegaste al límite de 25 tableros por sesión.'; end if;
  t := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.boards default values returning id into b;
  insert into private.board_access values(b,extensions.digest(t,'sha256'),auth.uid());
  insert into private.members values(b,auth.uid());
  return jsonb_build_object('id',b,'token',t);
end $$;

create function private.join_board(p_board uuid,p_token text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Necesitás una sesión.'; end if;
  if p_token is null or length(p_token) <> 64 or not exists(select 1 from private.board_access where board_id=p_board and token_hash=extensions.digest(p_token,'sha256')) then
    raise exception 'Enlace inválido o tablero inexistente.';
  end if;
  insert into private.members values(p_board,auth.uid()) on conflict do nothing;
end $$;

create function private.board_snapshot(p_board uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('board',to_jsonb(b),'players',coalesce((select jsonb_agg(p order by p.created_at,p.id) from public.players p where board_id=b.id),'[]'::jsonb),
    'locks',coalesce((select jsonb_agg(l) from private.player_locks l join public.players p on p.id=l.player_id where p.board_id=b.id and l.expires_at>now()),'[]'::jsonb))
  from public.boards b where b.id=p_board and private.is_member(b.id);
$$;

-- One row lock per board serializes mutations, counts and leases. Player versions
-- reject stale edits; operation IDs (player IDs / lease IDs) make retries safe.
create function private.change_player(p_board uuid,p_action text,p_id uuid,p_data jsonb default '{}'::jsonb,p_version integer default null,p_lease uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.players; l private.player_locks; event text; v integer;
begin
  if not private.is_member(p_board) then raise exception 'No tenés acceso a este tablero.'; end if;
  perform 1 from public.boards where id=p_board for update;
  if p_action='add' then
    if exists(select 1 from public.players where id=p_id and board_id=p_board) then return private.board_snapshot(p_board); end if;
    if (select count(*) from public.players where board_id=p_board)>=40 then raise exception 'Máximo: 40 jugadores por tablero.'; end if;
    insert into public.players(id,board_id,name,number,team,x,y) values(p_id,p_board,trim(p_data->>'name'),(p_data->>'number')::integer,p_data->>'team',(p_data->>'x')::float8,(p_data->>'y')::float8);
    event := 'player_added';
  else
    select * into p from public.players where id=p_id and board_id=p_board for update;
    if not found then
      if p_action in ('delete','release') then return private.board_snapshot(p_board); end if;
      raise exception 'El jugador ya no está en la cancha.';
    end if;
    select * into l from private.player_locks where player_id=p_id;
    if p_action='acquire' then
      if p_lease is null then raise exception 'Falta el identificador del arrastre.'; end if;
      if l.expires_at>now() and (l.user_id<>auth.uid() or l.lease_id<>p_lease) then raise exception 'Otro participante está moviendo este jugador.'; end if;
      insert into private.player_locks values(p_id,auth.uid(),p_lease,now()+interval '12 seconds')
      on conflict(player_id) do update set user_id=excluded.user_id,lease_id=excluded.lease_id,expires_at=excluded.expires_at;
      event := 'player_drag_started';
    elsif p_action in ('renew','move','release') then
      if l.user_id is distinct from auth.uid() or l.lease_id is distinct from p_lease or l.expires_at<=now() then
        if p_action='release' then return private.board_snapshot(p_board); end if;
        raise exception 'El bloqueo expiró. Volvé a intentar el movimiento.';
      end if;
      if p_action='renew' then
        update private.player_locks set expires_at=now()+interval '12 seconds' where player_id=p_id;
        event := 'player_drag_started';
      else
        if p_action='move' then
          update public.players set x=(p_data->>'x')::float8,y=(p_data->>'y')::float8,version=version+1,updated_at=now() where id=p_id;
        end if;
        delete from private.player_locks where player_id=p_id;
        event := 'player_drag_ended';
      end if;
    elsif p_action in ('update','delete') then
      if l.expires_at>now() then raise exception 'Esperá a que termine el arrastre para editar.'; end if;
      if p.version is distinct from p_version then raise exception 'El jugador cambió. Revisá sus datos y volvé a intentar.'; end if;
      if p_action='delete' then delete from public.players where id=p_id; event := 'player_deleted';
      else
        update public.players set name=trim(p_data->>'name'),number=(p_data->>'number')::integer,team=p_data->>'team',version=version+1,updated_at=now() where id=p_id;
        event := 'player_updated';
      end if;
    else raise exception 'Operación inválida.';
    end if;
  end if;
  update public.boards set version=version+1,updated_at=now() where id=p_board returning version into v;
  perform realtime.send(jsonb_build_object('version',v,'player_id',p_id),event,'board:'||p_board::text,true);
  return private.board_snapshot(p_board);
end $$;

create function private.change_board(p_board uuid,p_name text,p_orientation text,p_version integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  if not private.is_member(p_board) then raise exception 'No tenés acceso a este tablero.'; end if;
  update public.boards set name=trim(p_name),orientation=p_orientation,version=version+1,updated_at=now() where id=p_board and version=p_version returning version into v;
  if not found then raise exception 'El tablero cambió. Revisalo y volvé a intentar.'; end if;
  perform realtime.send(jsonb_build_object('version',v),'board_updated','board:'||p_board::text,true);
  return private.board_snapshot(p_board);
end $$;

-- Explicit invoker wrappers are the only exposed mutation endpoints.
create function public.create_board() returns jsonb language sql security invoker set search_path='' as $$ select private.create_board(); $$;
create function public.join_board(p_board uuid,p_token text) returns void language sql security invoker set search_path='' as $$ select private.join_board(p_board,p_token); $$;
create function public.board_snapshot(p_board uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.board_snapshot(p_board); $$;
create function public.change_player(p_board uuid,p_action text,p_id uuid,p_data jsonb default '{}'::jsonb,p_version integer default null,p_lease uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.change_player(p_board,p_action,p_id,p_data,p_version,p_lease); $$;
create function public.change_board(p_board uuid,p_name text,p_orientation text,p_version integer) returns jsonb language sql security invoker set search_path='' as $$ select private.change_board(p_board,p_name,p_orientation,p_version); $$;

revoke all on function private.create_board(),private.join_board(uuid,text),private.board_snapshot(uuid),private.change_player(uuid,text,uuid,jsonb,integer,uuid),private.change_board(uuid,text,text,integer) from public,anon;
grant execute on function private.create_board(),private.join_board(uuid,text),private.board_snapshot(uuid),private.change_player(uuid,text,uuid,jsonb,integer,uuid),private.change_board(uuid,text,text,integer) to authenticated;
revoke all on function public.create_board(),public.join_board(uuid,text),public.board_snapshot(uuid),public.change_player(uuid,text,uuid,jsonb,integer,uuid),public.change_board(uuid,text,text,integer) from public,anon;
grant execute on function public.create_board(),public.join_board(uuid,text),public.board_snapshot(uuid),public.change_player(uuid,text,uuid,jsonb,integer,uuid),public.change_board(uuid,text,text,integer) to authenticated;
