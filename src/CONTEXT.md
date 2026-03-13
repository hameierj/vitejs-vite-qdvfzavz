# B2B Rocket VIP Client Intake App — CONTEXT.md

## What This App Is
A web app for B2B Rocket's internal VIP team (CSMs and GTMs) to collect, organize, and AI-generate campaign intelligence for VIP clients. The VIP program is a managed outreach service — the team builds lead lists, writes campaign copy, and books meetings on behalf of clients. This app standardizes the intake process so every client gets a consistent, thorough onboarding.

## The Problem It Solves
Running cold outreach campaigns requires deep knowledge of each client's business — their products, ICPs, buyer personas, pain points, trigger events, messaging tone, and goals. Previously this info was gathered ad hoc. This app formalizes and accelerates that process using AI.

## Tech Stack
- **Framework:** React (single JSX file, Vite build)
- **Styling:** Inline styles + Tailwind utility classes (no compiler needed)
- **AI:** Anthropic Claude API (`claude-sonnet-4-20250514`), called directly from the browser using `anthropic-dangerous-direct-browser-access: true` header
- **Fonts:** Inter + JetBrains Mono (Google Fonts)
- **Deployment:** Vercel (auto-deploys from GitHub on push)
- **Repo:** GitHub (source of truth — all changes must be committed/pushed to trigger Vercel deploy)
- **No backend, no database** — all state is in-memory per session; API key stored in `localStorage`

## Brand
- **Primary color:** Indigo-violet `#5956D6` / `#4F46E5`
- **Design direction:** Clean, professional SaaS (think Linear/Notion) — not bold/flashy
- **Logo:** B2B Rocket logo embedded as base64 PNG (transparent background) in the sidebar
- **Typography:** Inter (UI) + JetBrains Mono (code/output blocks)

## App Architecture

### Two-Layer Data Model
1. **Company Profile** (filled once per client) — ~15 fields covering company basics, product/value prop, proof points, and campaign goals. Shared foundation for all ICPs.
2. **ICP Profiles** (unlimited per client) — each ICP is fully independent with its own firmographics, buyer persona, pain points & triggers, and messaging strategy. Nothing is shared between ICPs except the company foundation.

### Key Features
- **Quick Start modal** — CSM pastes a website URL, LinkedIn company URL, and/or uploads PDFs or raw text. AI reads everything and pre-fills all company fields + auto-drafts 2–4 ICPs. Each field gets a confidence score (green ≥80%, amber 55–79%, red <55%) so CSMs know what to review.
- **AI fill on every field** — clicking "✦ AI fill" opens a small popover with two options: (1) generate immediately from existing context, or (2) add custom instructions first. Uses ⌘↵ shortcut.
- **ICP kanban grid** — ICPs display as color-coded cards showing completion %, approval status, output readiness, and comment badges.
- **Per-ICP output generation** — each ICP generates 4 outputs in parallel: ICP Summary, Pain Point & Trigger Map, Campaign Strategy Brief, Email Copy (3-sequence, ready to send, no bracket placeholders).
- **Approval workflow** — ICP status flows: Draft → Pending Review → Approved / Changes Requested. Each of the 4 output tabs has its own approval button. "Approve All" available in header.
- **Comments system** — per-ICP comments tab. Unresolved comment count shown as amber badge on ICP cards.
- **Copy-to-clipboard** — each output tab has a copy button; "copy all" exports all 4 sections as a formatted block.
- **DOCX download** — "Download All" and "This ICP Only" buttons. Currently outputs structured .txt; wired for server-side docx generation when backend is added.

### User Roles
- **Team member (CSM/GTM):** Full editing access. Sees all client workspaces/accounts in sidebar. Can create new client workspaces.
- **Client:** Read-only access to their own workspace. Can leave comments but cannot edit. Quick Start and editing UI hidden.
- **Role switcher** in sidebar footer (labeled "PREVIEW AS") for demo/testing both views without separate logins.

### Navigation
- Three-panel sidebar: Company Profile → ICP Profiles → Outputs
- Fully flexible — jump anywhere at any time, no forced linear flow
- Sidebar bottom: Accounts & Workspaces section (replaced ICP mini-list) with searchable client list for team members

## Key AI Prompting Approach
- `draftICP()` — auto-generates a new ICP from company context when CSM clicks "Add ICP". Suggests different segments for subsequent ICPs to avoid duplicates.
- `generateOutputs()` — runs all 4 outputs in parallel per ICP
- `callAI(prompt, instructions?)` — base function that calls Anthropic API directly from browser. Accepts optional extra instructions appended to prompt.
- AI fill is contextual — reads all filled fields before suggesting content for the current one

## File Structure (Current — Monolithic)
```
src/
  App.tsx          ← entire app (~1,700 lines), needs to be split into components
  main.tsx
  index.css
  App.css
```

## Planned Component Split (Next Step)
```
src/
  App.tsx
  components/
    Sidebar.tsx
    ICPEditor.tsx
    CompanyPanel.tsx
    QuickStartModal.tsx
    OutputsPanel.tsx
    WorkspacePanel.tsx
  lib/
    callAI.ts
    constants.ts
```

## Deployment Workflow
1. Make changes in GitHub (or push from local)
2. Vercel auto-deploys on every push to main
3. Live URL: [your Vercel project URL]

> **Important:** Changes saved only in StackBlitz are NOT live until committed and pushed to GitHub.

## Future Roadmap
- [ ] Supabase backend — multi-client persistence, CSM auth, real-time comment sync
- [ ] Shareable read-only client review links (`/review/[token]`)
- [ ] Server-side DOCX generation with B2B Rocket branding
- [ ] Website scraper endpoint to auto-pre-fill fields from URL before session starts
- [ ] B2B Rocket campaign builder integration (export structured JSON via POST)
- [ ] "Compare ICPs" side-by-side view
- [ ] CSM dashboard — all accounts with status, completion %, brief status

## How to Start a New Claude Chat for This Project
1. Paste this `CONTEXT.md` file at the start of the chat
2. Paste **only the component or section** you're changing (not the full file)
3. Ask Claude to make the specific change
4. Copy the result back to GitHub
5. Vercel auto-deploys
