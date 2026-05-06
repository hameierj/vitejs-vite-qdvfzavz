-- CX v2 schema (additive — app_data table is preserved and untouched)

-- Clients table: one row per client company
create table if not exists clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  domain      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Workspaces: one per client engagement
create table if not exists workspaces (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references clients(id) on delete cascade,
  name          text not null,
  share_token   text unique not null default encode(gen_random_bytes(16), 'hex'),
  stage         int not null default 1 check (stage between 1 and 7),
  stage_statuses jsonb not null default '{}',
  raw_data      jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Documents: versioned, typed documents attached to a workspace
create table if not exists documents (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  type         text not null,  -- 'handoff' | 'research' | 'strategy' | 'onboarding' | etc.
  version      int not null default 1,
  content      jsonb not null default '{}',
  approved_at  timestamptz,
  approved_by  text,
  created_at   timestamptz not null default now()
);

-- Campaigns: one per outreach campaign within a workspace
create table if not exists campaigns (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name         text not null,
  status       text not null default 'draft',  -- 'draft' | 'active' | 'paused' | 'ended'
  data         jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Campaign variants: A/B test variants within a campaign
create table if not exists campaign_variants (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  name        text not null,
  content     jsonb not null default '{}',
  is_winner   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Analytics uploads: B2B Rocket CSV exports
create table if not exists analytics_uploads (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  campaign_id  uuid references campaigns(id) on delete set null,
  filename     text not null,
  raw_csv      text,
  parsed       jsonb not null default '{}',
  scorecard    jsonb not null default '{}',
  uploaded_at  timestamptz not null default now()
);

-- Communications: touchpoint log per workspace
create table if not exists communications (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  type         text not null,  -- 'email' | 'call' | 'slack' | 'meeting' | 'other'
  summary      text not null,
  flags        jsonb not null default '[]',
  logged_at    timestamptz not null default now(),
  logged_by    text
);

-- Domains: mailbox infrastructure per workspace
create table if not exists domains (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  domain       text not null,
  mailboxes    int not null default 0,
  provider     text,
  status       text not null default 'pending',  -- 'pending' | 'active' | 'issue'
  created_at   timestamptz not null default now()
);

-- Auto-update updated_at on workspaces and campaigns
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger workspaces_updated_at before update on workspaces
  for each row execute function set_updated_at();

create trigger campaigns_updated_at before update on campaigns
  for each row execute function set_updated_at();

create trigger clients_updated_at before update on clients
  for each row execute function set_updated_at();

-- Indexes for common lookups
create index if not exists idx_workspaces_client_id on workspaces(client_id);
create index if not exists idx_workspaces_share_token on workspaces(share_token);
create index if not exists idx_documents_workspace_type on documents(workspace_id, type);
create index if not exists idx_campaigns_workspace_id on campaigns(workspace_id);
create index if not exists idx_analytics_workspace_id on analytics_uploads(workspace_id);
create index if not exists idx_communications_workspace_id on communications(workspace_id);
create index if not exists idx_domains_workspace_id on domains(workspace_id);
