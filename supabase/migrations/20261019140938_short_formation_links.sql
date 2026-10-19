create table private.board_links (
  code_hash bytea primary key check(octet_length(code_hash)=32),
  board_id uuid not null references public.boards(id) on delete cascade,
  formation_id uuid not null unique,
  foreign key(formation_id,board_id) references public.formations(id,board_id) on delete cascade
);
create index board_links_board on private.board_links(board_id);
alter table private.board_links enable row level security;
revoke all on private.board_links from public,anon,authenticated;

create function private.get_board_link(p_board uuid,p_formation uuid) returns text
language plpgsql security definer set search_path='' as $$
declare secret bytea; code text;
begin
  if not private.is_member(p_board) then raise exception 'No tenés acceso a este tablero.'; end if;
  perform private.touch_board(p_board);
  if not exists(select 1 from public.formations where id=p_formation and board_id=p_board) then
    raise exception 'La formación ya no existe.';
  end if;
  select token_hash into secret from private.board_access where board_id=p_board;
  -- Derive a pseudorandom 192-bit code with the private board secret. This
  -- reuses one code per formation without storing the raw invitation code.
  code:=translate(encode(substring(extensions.hmac(
    convert_to('bizarron:formation-link:v1:'||p_formation::text,'UTF8'),secret,'sha256'
  ) from 1 for 24),'base64'),'+/','-_');
  insert into private.board_links(code_hash,board_id,formation_id)
    values(extensions.digest(code,'sha256'),p_board,p_formation)
    on conflict(formation_id) do nothing;
  return code;
end $$;

create function private.open_board_link(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare link private.board_links;
begin
  if auth.uid() is null then raise exception 'Necesitás una sesión.'; end if;
  if p_code is null or p_code !~ '^[A-Za-z0-9_-]{32}$' then raise exception 'Enlace inválido.'; end if;
  select * into link from private.board_links where code_hash=extensions.digest(p_code,'sha256');
  if not found then
    raise exception using errcode='PT410',message='Esta pizarra venció, la formación se eliminó o el enlace no es válido.';
  end if;
  -- Authorization and resolution happen together; no public lookup endpoint.
  insert into private.members(board_id,user_id) values(link.board_id,auth.uid()) on conflict do nothing;
  perform private.touch_board(link.board_id);
  return jsonb_build_object('board_id',link.board_id,'formation_id',link.formation_id);
end $$;

create function private.create_shared_board() returns jsonb
language plpgsql security definer set search_path='' as $$
declare created jsonb; b uuid; f uuid;
begin
  created:=private.create_board();
  b:=(created->>'id')::uuid;
  f:=private.original_formation(b);
  return jsonb_build_object('code',private.get_board_link(b,f));
end $$;

create function public.get_board_link(p_board uuid,p_formation uuid) returns text
language sql security invoker set search_path='' as $$select private.get_board_link(p_board,p_formation);$$;
create function public.open_board_link(p_code text) returns jsonb
language sql security invoker set search_path='' as $$select private.open_board_link(p_code);$$;
create function public.create_shared_board() returns jsonb
language sql security invoker set search_path='' as $$select private.create_shared_board();$$;
revoke all on function private.get_board_link(uuid,uuid),private.open_board_link(text),private.create_shared_board(),
  public.get_board_link(uuid,uuid),public.open_board_link(text),public.create_shared_board() from public,anon;
grant execute on function private.get_board_link(uuid,uuid),private.open_board_link(text),private.create_shared_board(),
  public.get_board_link(uuid,uuid),public.open_board_link(text),public.create_shared_board() to authenticated;
notify pgrst,'reload schema';
