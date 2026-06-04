-- app_data: generic key/value store used by the CX tool frontend
-- This table predates the structured schema migrations; it is preserved as-is.

create table if not exists app_data (
  key   text primary key,
  value jsonb not null default '{}'
);

alter table app_data disable row level security;
