-- Add HubSpot linking to workspaces
alter table workspaces
  add column if not exists hubspot_company_id text,
  add column if not exists hubspot_synced_at  timestamptz;

create index if not exists idx_workspaces_hubspot_id on workspaces(hubspot_company_id);
