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

