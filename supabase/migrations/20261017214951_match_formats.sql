alter table public.boards add column players_per_team smallint not null default 11
  check (players_per_team in (7,11));

-- Cover quick additions, legacy add RPCs and transfers between teams. The board
-- row lock serializes admission with format changes and all player mutations.
create function private.validate_team_capacity() returns trigger
language plpgsql security invoker set search_path='' as $$
declare capacity integer;
begin
  select players_per_team into capacity from public.boards where id=new.board_id for update;
  if tg_op='UPDATE' then
    if new.board_id<>old.board_id then raise exception 'No se puede trasladar un jugador a otro tablero.'; end if;
    if new.team=old.team then return new; end if;
  end if;
  if (select count(*) from public.players where board_id=new.board_id and team=new.team and id<>new.id)>=capacity then
    raise exception 'El equipo % ya tiene % jugadores. No se puede superar el límite de fútbol %.',new.team,capacity,capacity;
  end if;
  return new;
end $$;
revoke all on function private.validate_team_capacity() from public,anon,authenticated;
create trigger validate_team_capacity before insert or update on public.players
for each row execute function private.validate_team_capacity();

create or replace function private.quick_add_player(p_board uuid,p_id uuid,p_team text,p_x double precision,p_y double precision)
returns jsonb language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if not private.is_member(p_board) then raise exception 'No tenés acceso a este tablero.'; end if;
  perform 1 from public.boards where id=p_board for update;
  if exists(select 1 from public.players where id=p_id and board_id=p_board) then return private.board_snapshot(p_board); end if;
  if p_team is null or p_team not in ('A','B') then raise exception 'Elegí un equipo válido.'; end if;
  if not exists(select 1 from public.players where board_id=p_board and team=p_team) then
    n:=1;
  else
    select coalesce((select last_number from private.team_numbers where board_id=p_board and team=p_team),0)+1 into n;
  end if;
  if n>99 then raise exception 'Este equipo llegó al número 99. No se pueden agregar más camisetas automáticamente.'; end if;
  insert into private.team_numbers values(p_board,p_team,n)
  on conflict(board_id,team) do update set last_number=excluded.last_number;
  return private.change_player(p_board,'add',p_id,jsonb_build_object('name','Jugador '||n,'number',n,'team',p_team,'x',p_x,'y',p_y));
end $$;

create function private.change_format(p_board uuid,p_format integer,p_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.boards; v integer;
begin
  if not private.is_member(p_board) then raise exception 'No tenés acceso a este tablero.'; end if;
  if p_format is null or p_format not in (7,11) then raise exception 'Elegí fútbol 7 o fútbol 11.'; end if;
  select * into b from public.boards where id=p_board for update;
  if b.players_per_team=p_format then return private.board_snapshot(p_board); end if;
  if b.version is distinct from p_version then raise exception 'El tablero cambió. Revisalo y volvé a intentar.'; end if;
  if exists(select 1 from public.players where board_id=p_board) then
    raise exception 'Hay una formación pendiente. Vaciá la cancha antes de cambiar de formato.';
  end if;
  delete from private.team_numbers where board_id=p_board;
  update public.boards set players_per_team=p_format,version=version+1,updated_at=now() where id=p_board returning version into v;
  perform realtime.send(jsonb_build_object('version',v),'board_updated','board:'||p_board::text,true);
  return private.board_snapshot(p_board);
end $$;
create function public.change_format(p_board uuid,p_format integer,p_version integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.change_format(p_board,p_format,p_version); $$;
revoke all on function private.change_format(uuid,integer,integer),public.change_format(uuid,integer,integer) from public,anon;
grant execute on function private.change_format(uuid,integer,integer),public.change_format(uuid,integer,integer) to authenticated;
