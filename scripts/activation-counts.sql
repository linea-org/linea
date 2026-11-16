-- Activation funnel (owners only, so invited members do not inherit a workspace's activity; a later
-- session update counts as a return visit):
-- run with `psql "$DATABASE_URL" -f scripts/activation-counts.sql`.
select
  count(*) as signed_up,
  count(*) filter (where exists (
    select 1 from members m join workflows w on w.workspace_id = m.organization_id
    where m.user_id = u.id and m.role = 'owner' and not w.scratch
  )) as created_workflow,
  count(*) filter (where exists (
    select 1 from members m join executions e on e.workspace_id = m.organization_id
    where m.user_id = u.id and m.role = 'owner' and e.status = 'succeeded'
  )) as got_successful_run,
  count(*) filter (where exists (
    select 1 from sessions s
    where s.user_id = u.id and s.updated_at::date > u.created_at::date
  )) as returned_next_day
from users u;
