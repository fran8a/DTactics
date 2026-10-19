-- New Supabase projects may include this platform event trigger. It is not an
-- application RPC. Revoking client EXECUTE keeps its DDL-trigger behavior.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
