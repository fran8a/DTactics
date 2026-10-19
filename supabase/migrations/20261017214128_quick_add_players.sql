-- Keep one independent, monotonic shirt counter per board and team. Allocation
-- shares change_player's board row lock, so concurrent additions cannot collide.
create table private.team_numbers (
  board_id uuid not null references public.boards on delete cascade,
  team text not null check (team in ('A','B')),
  last_number integer not null check (last_number between 0 and 99),
  primary key (board_id, team)
);
alter table private.team_numbers enable row level security;
revoke all on private.team_numbers from public, anon, authenticated;
insert into private.team_numbers(board_id,team,last_number)
select board_id,team,max(number) from public.players group by board_id,team;

create function private.quick_add_player(p_board uuid,p_id uuid,p_team text,p_x double precision,p_y double precision)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not private.is_member(p_board) then raise exception 'No tenés acceso a este tablero.'; end if;
  perform 1 from public.boards where id=p_board for update;
  if exists(select 1 from public.players where id=p_id and board_id=p_board) then
    return private.board_snapshot(p_board);
  end if;
  if p_team is null or p_team not in ('A','B') then raise exception 'Elegí un equipo válido.'; end if;
  select coalesce((select last_number from private.team_numbers where board_id=p_board and team=p_team),0)+1 into n;
  if n>99 then raise exception 'Este equipo llegó al número 99. No se pueden agregar más camisetas automáticamente.'; end if;
  insert into private.team_numbers values(p_board,p_team,n)
  on conflict(board_id,team) do update set last_number=excluded.last_number;
  return private.change_player(p_board,'add',p_id,jsonb_build_object('name','Jugador '||n,'number',n,'team',p_team,'x',p_x,'y',p_y));
end $$;
create function public.quick_add_player(p_board uuid,p_id uuid,p_team text,p_x double precision,p_y double precision)
returns jsonb language sql security invoker set search_path='' as $$
  select private.quick_add_player(p_board,p_id,p_team,p_x,p_y);
$$;
revoke all on function private.quick_add_player(uuid,uuid,text,double precision,double precision),public.quick_add_player(uuid,uuid,text,double precision,double precision) from public,anon;
grant execute on function private.quick_add_player(uuid,uuid,text,double precision,double precision),public.quick_add_player(uuid,uuid,text,double precision,double precision) to authenticated;
