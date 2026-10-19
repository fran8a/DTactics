-- Infrastructure migration: pg_cron runs on Supabase/Postgres, not PGlite.
-- A stable cutoff allows the last_seen index to serve the cleanup query.
create or replace function private.cleanup_expired_boards(p_limit integer default 100) returns integer
language plpgsql security definer set search_path='' as $$
declare removed integer;
begin
  with expired as materialized (
    select board_id from private.board_liveness
    where last_seen_at <= statement_timestamp()-interval '10 minutes'
    order by last_seen_at,board_id
    limit greatest(1,least(coalesce(p_limit,100),500))
    for update skip locked
  )
  delete from public.boards b using expired e where b.id=e.board_id;
  get diagnostics removed = row_count;
  return removed;
end $$;
create extension if not exists pg_cron;
select cron.schedule(
  'cleanup-expired-boards',
  '* * * * *',
  'select private.cleanup_expired_boards(100);'
);
