-- One ball per formation. Its formation UUID is also its drag/preview ID.
-- Keep it outside the player roster, team limits, and clear-players actions.
create table private.ball_state (
  formation_id uuid primary key,
  board_id uuid not null references public.boards(id) on delete cascade,
  x double precision not null default 0.5 check(x between 0 and 1),
  y double precision not null default 0.5 check(y between 0 and 1),
  version integer not null default 1,
  head uuid,
  user_id uuid references auth.users(id) on delete set null,
  lease_id uuid,
  expires_at timestamptz,
  foreign key(formation_id,board_id) references public.formations(id,board_id) on delete cascade
);
create index ball_state_board on private.ball_state(board_id);
create index ball_state_user on private.ball_state(user_id) where user_id is not null;
alter table private.ball_state enable row level security;
revoke all on private.ball_state from public,anon,authenticated;
insert into private.ball_state(formation_id,board_id) select id,board_id from public.formations;

create function private.seed_ball() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into private.ball_state(formation_id,board_id) values(new.id,new.board_id);
  return new;
end $$;
revoke all on function private.seed_ball() from public,anon,authenticated;
create trigger seed_formation_ball after insert on public.formations for each row execute function private.seed_ball();

alter function private.formation_snapshot(uuid,uuid) rename to formation_snapshot_without_ball;
revoke all on function private.formation_snapshot_without_ball(uuid,uuid) from public,anon,authenticated;
create function private.formation_snapshot(p_board uuid,p_formation uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s jsonb; b private.ball_state;
begin
  s:=private.formation_snapshot_without_ball(p_board,p_formation);
  if s is null then return null; end if;
  select * into b from private.ball_state where formation_id=(s->'formation'->>'id')::uuid;
  return s||jsonb_build_object(
    'ball',jsonb_build_object('id',b.formation_id,'x',b.x,'y',b.y,'version',b.version),
    'locks',(s->'locks')||case when b.user_id is not null and b.expires_at>now() then
      jsonb_build_array(jsonb_build_object('player_id',b.formation_id,'user_id',b.user_id,'lease_id',b.lease_id,'expires_at',b.expires_at))
      else '[]'::jsonb end);
end $$;
revoke all on function private.formation_snapshot(uuid,uuid) from public,anon;
grant execute on function private.formation_snapshot(uuid,uuid) to authenticated;

-- Same lease, renewal, snapshot version and broadcast contract as player drags.
create function private.change_ball(p_board uuid,p_formation uuid,p_action text,p_id uuid,p_data jsonb default '{}'::jsonb,p_version integer default null,p_lease uuid default null,p_operation uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b private.ball_state; op private.player_operations; event text; next_x double precision; next_y double precision;
begin
  if not private.is_member(p_board) then raise exception 'No tenés acceso a este tablero.'; end if;
  perform 1 from public.boards where id=p_board for update;
  if p_id is distinct from p_formation then raise exception 'Pelota inválida.'; end if;
  select * into b from private.ball_state where board_id=p_board and formation_id=p_formation for update;
  if not found then raise exception 'La formación ya no existe.'; end if;
  if p_action='move' and p_operation is not null then
    select * into op from private.player_operations where id=p_operation;
    if found then
      if op.actor_id<>auth.uid() or op.board_id<>p_board or op.formation_id<>p_formation or op.type<>'ball_move' then
        raise exception 'Identificador de operación inválido.';
      end if;
      return private.formation_snapshot(p_board,p_formation)||jsonb_build_object('operation',to_jsonb(op)||jsonb_build_object('kind','ball'));
    end if;
  end if;
  if p_action='acquire' then
    if p_lease is null then raise exception 'Falta el permiso de arrastre.'; end if;
    if b.user_id is not null and b.expires_at>now() and (b.user_id<>auth.uid() or b.lease_id is distinct from p_lease) then
      raise exception 'Alguien está moviendo la pelota.';
    end if;
    update private.ball_state set user_id=auth.uid(),lease_id=p_lease,expires_at=now()+interval '12 seconds' where formation_id=p_formation;
    event:='ball_drag_started';
  elsif p_action in ('renew','release','move') then
    if b.user_id is distinct from auth.uid() or b.lease_id is distinct from p_lease or b.expires_at is null or b.expires_at<=now() then
      if p_action='release' then return private.formation_snapshot(p_board,p_formation); end if;
      raise exception 'El permiso de arrastre venció. Volvé a intentar.';
    end if;
    if p_action='renew' then
      update private.ball_state set expires_at=now()+interval '12 seconds' where formation_id=p_formation;
      event:='ball_drag_started';
    else
      if p_action='move' then
        if p_operation is null then raise exception 'Falta el identificador de la operación.'; end if;
        if jsonb_typeof(p_data->'x') is distinct from 'number' or jsonb_typeof(p_data->'y') is distinct from 'number' then
          raise exception 'La posición de la pelota no es válida.';
        end if;
        next_x:=(p_data->>'x')::double precision; next_y:=(p_data->>'y')::double precision;
        if next_x not between 0 and 1 or next_y not between 0 and 1 then raise exception 'La pelota debe permanecer dentro de la cancha.'; end if;
        if b.x<>next_x or b.y<>next_y then
          update private.player_operations set status='invalidated' where actor_id=auth.uid() and formation_id=p_formation and status='undone';
          insert into private.player_operations(id,board_id,formation_id,actor_id,player_id,type,before_data,after_data,before_head)
            values(p_operation,p_board,p_formation,auth.uid(),p_formation,'ball_move',jsonb_build_object('x',b.x,'y',b.y),jsonb_build_object('x',next_x,'y',next_y),b.head) returning * into op;
          update private.ball_state set x=next_x,y=next_y,version=version+1,head=op.id where formation_id=p_formation;
          delete from private.player_operations where actor_id=auth.uid() and formation_id=p_formation and id not in (
            select id from private.player_operations where actor_id=auth.uid() and formation_id=p_formation order by created_at desc,id desc limit 50);
        end if;
      end if;
      update private.ball_state set user_id=null,lease_id=null,expires_at=null where formation_id=p_formation;
      event:='ball_drag_ended';
    end if;
  else raise exception 'Operación de pelota inválida.';
  end if;
  perform private.touch_formation(p_board,p_formation,event,p_formation);
  return private.formation_snapshot(p_board,p_formation)||case when op.id is null then '{}'::jsonb else jsonb_build_object('operation',to_jsonb(op)||jsonb_build_object('kind','ball')) end;
end $$;

create function private.reverse_ball_operation(p_board uuid,p_formation uuid,p_operation uuid,p_direction text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b private.ball_state; op private.player_operations; target jsonb; expected uuid;
begin
  if not private.is_member(p_board) then raise exception 'No tenés acceso a este tablero.'; end if;
  perform 1 from public.boards where id=p_board for update;
  if p_direction is null or p_direction not in ('undo','redo') then raise exception 'Operación de historial inválida.'; end if;
  select * into op from private.player_operations where id=p_operation and board_id=p_board and formation_id=p_formation and actor_id=auth.uid() and type='ball_move' for update;
  if not found then raise exception 'La operación ya no está disponible en tu historial.'; end if;
  if op.status='invalidated' then raise exception 'Se descartó la rama de rehacer al realizar una nueva acción.'; end if;
  if (p_direction='undo' and op.status='undone') or (p_direction='redo' and op.status='applied') then return private.formation_snapshot(p_board,p_formation); end if;
  select * into b from private.ball_state where formation_id=p_formation and board_id=p_board for update;
  if not found then raise exception 'La formación ya no existe.'; end if;
  expected:=case when p_direction='undo' then op.id else op.before_head end;
  if b.head is distinct from expected then raise exception 'No se puede revertir: la pelota recibió cambios posteriores.'; end if;
  if b.user_id is not null and b.expires_at>now() then raise exception 'Esperá a que termine el arrastre para deshacer o rehacer.'; end if;
  target:=case when p_direction='undo' then op.before_data else op.after_data end;
  update private.ball_state set x=(target->>'x')::double precision,y=(target->>'y')::double precision,version=version+1,
    head=case when p_direction='undo' then op.before_head else op.id end where formation_id=p_formation;
  update private.player_operations set status=case when p_direction='undo' then 'undone' else 'applied' end where id=op.id;
  perform private.touch_formation(p_board,p_formation,'ball_updated',p_formation);
  return private.formation_snapshot(p_board,p_formation);
end $$;

-- Preserve all existing formation/tactics behavior and copy the saved ball too.
alter function private.manage_formation(uuid,text,uuid,text,uuid,integer) rename to manage_formation_without_ball;
revoke all on function private.manage_formation_without_ball(uuid,text,uuid,text,uuid,integer) from public,anon,authenticated;
create function private.manage_formation(p_board uuid,p_action text,p_id uuid,p_name text default null,p_source uuid default null,p_version integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb; source_id uuid; existed boolean;
begin
  if not private.is_member(p_board) then raise exception 'No tenés acceso a este tablero.'; end if;
  perform 1 from public.boards where id=p_board for update;
  source_id:=coalesce(p_source,private.original_formation(p_board));
  existed:=exists(select 1 from public.formations where id=p_id);
  if p_action='duplicate' and exists(select 1 from private.ball_state where formation_id=source_id and board_id=p_board and user_id is not null and expires_at>now()) then
    raise exception 'Esperá a que termine el arrastre de la pelota antes de duplicar.';
  end if;
  s:=private.manage_formation_without_ball(p_board,p_action,p_id,p_name,p_source,p_version);
  if p_action='duplicate' and not existed then
    update private.ball_state target set x=source.x,y=source.y from private.ball_state source where target.formation_id=p_id and source.formation_id=source_id and source.board_id=p_board;
    s:=private.formation_snapshot(p_board,p_id);
  end if;
  return s;
end $$;
revoke all on function private.manage_formation(uuid,text,uuid,text,uuid,integer) from public,anon;
grant execute on function private.manage_formation(uuid,text,uuid,text,uuid,integer) to authenticated;

create function public.change_ball(p_board uuid,p_formation uuid,p_action text,p_id uuid,p_data jsonb default '{}'::jsonb,p_version integer default null,p_lease uuid default null,p_operation uuid default null)
returns jsonb language sql security invoker set search_path='' as $$select private.change_ball(p_board,p_formation,p_action,p_id,p_data,p_version,p_lease,p_operation);$$;
create function public.reverse_ball_operation(p_board uuid,p_formation uuid,p_operation uuid,p_direction text) returns jsonb
language sql security invoker set search_path='' as $$select private.reverse_ball_operation(p_board,p_formation,p_operation,p_direction);$$;
revoke all on function private.change_ball(uuid,uuid,text,uuid,jsonb,integer,uuid,uuid),public.change_ball(uuid,uuid,text,uuid,jsonb,integer,uuid,uuid),
  private.reverse_ball_operation(uuid,uuid,uuid,text),public.reverse_ball_operation(uuid,uuid,uuid,text) from public,anon;
grant execute on function private.change_ball(uuid,uuid,text,uuid,jsonb,integer,uuid,uuid),public.change_ball(uuid,uuid,text,uuid,jsonb,integer,uuid,uuid),
  private.reverse_ball_operation(uuid,uuid,uuid,text),public.reverse_ball_operation(uuid,uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
