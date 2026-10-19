-- Serialize against player edits/additions using the same board lock.
create or replace function private.change_settings_v2(
  p_board uuid,p_formation uuid,p_name text,p_orientation text,p_format integer,p_version integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.formations;
begin
  if not private.is_member(p_board) then raise exception 'No tenés acceso a este tablero.'; end if;
  perform 1 from public.boards where id=p_board for update;
  if (select version from public.boards where id=p_board) is distinct from p_version then
    raise exception 'El tablero cambió. Revisalo y volvé a intentar.';
  end if;
  select * into f from public.formations where id=p_formation and board_id=p_board;
  if not found then raise exception 'La formación ya no existe.'; end if;
  if p_format is null or p_format not in (7,11) then raise exception 'Elegí fútbol 7 o fútbol 11.'; end if;
  if exists(
    select 1 from public.players where formation_id=f.id and placement='field'
    group by team having count(*) > p_format
  ) then
    raise exception 'Hay un equipo con más de % titulares. Enviá jugadores al banco antes de cambiar a fútbol %.',p_format,p_format;
  end if;
  -- Keep every player, position, bench placement and number counter intact.
  update public.boards set name=trim(p_name) where id=p_board;
  update public.formations set orientation=p_orientation,players_per_team=p_format where id=f.id;
  perform private.touch_formation(p_board,f.id,'board_updated');
  return private.formation_snapshot(p_board,f.id);
end $$;
revoke all on function private.change_settings_v2(uuid,uuid,text,text,integer,integer) from public,anon;
grant execute on function private.change_settings_v2(uuid,uuid,text,text,integer,integer) to authenticated;
