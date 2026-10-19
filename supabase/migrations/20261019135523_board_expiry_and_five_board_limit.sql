-- Keep liveness separate from board snapshots and Realtime broadcasts.
create table private.board_liveness (
  board_id uuid primary key references public.boards(id) on delete cascade,
  last_seen_at timestamptz not null default clock_timestamp()
);
create index board_liveness_last_seen on private.board_liveness(last_seen_at, board_id);
alter table private.board_liveness enable row level security;
revoke all on private.board_liveness from public, anon, authenticated;

-- Existing boards receive the full inactivity window when this migration runs.
insert into private.board_liveness(board_id) select id from public.boards;

create function private.initialize_board_liveness() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.board_liveness(board_id) values(new.id);
  return new;
end $$;
revoke all on function private.initialize_board_liveness() from public, anon, authenticated;
create trigger initialize_board_liveness after insert on public.boards
for each row execute function private.initialize_board_liveness();

create function private.touch_board(p_board uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare seen timestamptz;
begin
  -- Both renewal and deletion lock the same row: a stale heartbeat cannot
  -- resurrect a board, and cleanup skips a renewal already in progress.
  select last_seen_at into seen from private.board_liveness
    where board_id=p_board for update;
  if not found or seen <= clock_timestamp() - interval '10 minutes' then
    raise exception using errcode='PT410', message='Esta pizarra venció por inactividad o ya no existe.';
  end if;
  if not private.is_member(p_board) then
    raise exception 'No tenés acceso a este tablero.';
  end if;
  update private.board_liveness set last_seen_at=clock_timestamp() where board_id=p_board;
end $$;
revoke all on function private.touch_board(uuid) from public, anon;
grant execute on function private.touch_board(uuid) to authenticated;
create function public.touch_board(p_board uuid) returns void
language sql security invoker set search_path='' as $$ select private.touch_board(p_board); $$;
revoke all on function public.touch_board(uuid) from public, anon;
grant execute on function public.touch_board(uuid) to authenticated;

create or replace function private.join_board(p_board uuid,p_token text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Necesitás una sesión.'; end if;
  if not exists(select 1 from public.boards where id=p_board) then
    raise exception using errcode='PT410', message='Esta pizarra venció por inactividad o ya no existe.';
  end if;
  if p_token is null or length(p_token) <> 64 or not exists(
    select 1 from private.board_access where board_id=p_board
      and token_hash=extensions.digest(p_token,'sha256')
  ) then raise exception 'Enlace inválido o tablero inexistente.'; end if;
  insert into private.members values(p_board,auth.uid()) on conflict do nothing;
  perform private.touch_board(p_board);
end $$;

create or replace function private.create_board() returns jsonb
language plpgsql security definer set search_path='' as $$
declare b uuid; t text;
begin
  if auth.uid() is null then raise exception 'Necesitás una sesión.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if (select count(*) from private.board_access a
      join private.board_liveness l on l.board_id=a.board_id
      where a.creator=auth.uid() and l.last_seen_at > clock_timestamp()-interval '10 minutes') >= 5 then
    raise exception 'Llegaste al máximo de 5 pizarras vigentes por usuario. Esperá a que venza alguna para crear otra.';
  end if;
  t:=encode(extensions.gen_random_bytes(32),'hex');
  insert into public.boards default values returning id into b;
  insert into private.board_access values(b,extensions.digest(t,'sha256'),auth.uid());
  insert into private.members values(b,auth.uid());
  return jsonb_build_object('id',b,'token',t);
end $$;

create function private.cleanup_expired_boards(p_limit integer default 100) returns integer
language plpgsql security definer set search_path='' as $$
declare removed integer;
begin
  with expired as materialized (
    select board_id from private.board_liveness
    where last_seen_at <= clock_timestamp()-interval '10 minutes'
    order by last_seen_at,board_id
    limit greatest(1,least(coalesce(p_limit,100),500))
    for update skip locked
  )
  delete from public.boards b using expired e where b.id=e.board_id;
  get diagnostics removed = row_count;
  return removed;
end $$;
revoke all on function private.cleanup_expired_boards(integer) from public, anon, authenticated;
notify pgrst, 'reload schema';
