-- Add intake form support to workspaces
-- intake_token: unique shareable token for the client intake form
-- intake_submitted_at: when the client submitted the form
-- intake_data: the raw form submission (stored in raw_data via app layer, this column is for direct DB writes from the form)

alter table workspaces
  add column if not exists intake_token text unique default replace(gen_random_uuid()::text, '-', ''),
  add column if not exists intake_submitted_at timestamptz,
  add column if not exists intake_data jsonb not null default '{}';

create index if not exists idx_workspaces_intake_token on workspaces(intake_token);
