-- Disable RLS on all CX v2 tables (internal tool, anon key access)
-- Matches the existing app_data table setup

alter table clients           disable row level security;
alter table workspaces        disable row level security;
alter table documents         disable row level security;
alter table campaigns         disable row level security;
alter table campaign_variants disable row level security;
alter table analytics_uploads disable row level security;
alter table communications    disable row level security;
alter table domains           disable row level security;
