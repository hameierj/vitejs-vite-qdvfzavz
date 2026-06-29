# Automated Onboarding — Full Data Flow (Miro Reference)

> **Vision:** the client fills out *one form* and the AI does the rest — research →
> products → market/ICPs → personas (AI agents) → campaigns, with sending
> infrastructure built in parallel. CSM + client review at the gates; then launch.
>
> This doc extrapolates **every field captured and every input/output of each AI
> step** from the CX tool (`~/projects/cx-tool`) so you can build the Miro node-by-node.

---

## 0. How the Miro diagram maps to the real tool

Your Miro boxes are the *idealized* flow. Here's how each maps to what's actually
built (gated Flow 1 in `OnboardingGates.tsx` + edge functions):

| Miro box | Real tool step | Engine |
|---|---|---|
| Onboarding Call | Pre-call AI Research Brief (optional, CSM-run) | `gs-research-run` |
| Invite Team Members | Workspace/team setup (app account) | — |
| Connect Account | OAuth / mailbox + CRM connect | — |
| **Fill out intake form** | `ClientIntakeForm` — public link, 6 sections | Supabase `app_data` |
| RESEARCH (Company) | **Gate 1** Company Research | `gs-research-run` |
| RESEARCH (Products/Services) | **Gate 2** Products & Services | `products-run` |
| RESEARCH (ICPs) | **Gate 3** TAM Tree → ICPs + 5-dim scoring | `tam-icp-run` |
| Configure AI Agents | **Gate 4** Personas (the AI-SDR brains) | `personas-run` |
| Campaigns Created | **Gate 5** Outreach Campaigns (LI + 3 email) | `EmailCampaignGenerator` / `launch-plan-run` |
| Domains & Mailboxes Configured | **Track B** Infra (runs in parallel) | `infra-run` |
| Audiences Created | Lead lists per ICP/persona ⚠️ *see gap note* | (downstream) |
| Client + CSM Review | The **review → refine → confirm** gate on every step | UI gates |
| LAUNCHED | Launch board activates campaigns | `launch-plan-run` |

**Two tracks run at once:**
- **Track A (sequential, gated):** Research → Products → TAM/ICP → Personas → Campaigns. Each gate: *AI generates → CSM/client reviews → refine in chat → confirm → unlocks next.*
- **Track B (parallel):** Domains & Mailboxes — sized from the intake form **alone**, kicks off the moment intake is submitted. One-time setup, locked after confirm.

⚠️ **Gap to flag in Miro:** "Audiences Created" (actual lead lists pulled to match each ICP/persona) is **not** an edge function yet — ICPs/personas are defined, but list-building/enrichment is a downstream step. Mark it as a TODO node.

---

## NODE 1 — Onboarding Call  *(pre-form)*
Human kickoff. Optionally backed by the **AI Research Brief** (`InitialResearchBrief.tsx`):
CSM enters client domain → Jina.ai scrapes site → Claude Sonnet drafts a brief used for call prep. This is the *same* engine as Gate 1, run early.

## NODE 2 — Invite Team Members
App-level. Client invites teammates into the workspace. No AI.

## NODE 3 — Connect Account
OAuth / connect sending + CRM (mailboxes, HubSpot, etc.). No AI. Feeds nothing into Track A directly, but is a launch prerequisite.

---

## NODE 4 — Fill Out Intake Form  ⭐ *the single source of truth*

Public form at `/#/intake/<share_token>` — no login. Saves to `app_data[ws_<id>].companyData._intakeData`. **Required fields marked ★.** This is the ONLY thing the client must do — everything downstream is AI.

### Section 1 — About Your Business
| Field | Key | Notes |
|---|---|---|
| What does your company do? (plain English) ★ | `businessDescription` | "We help [buyer] do [outcome] by [mechanism]" |
| What specific problem do you solve? ★ | `coreProblem` | |
| Current best customers | `currentCustomers` | company types / industries / names |
| 3 strongest proof points / case-study results | `topProofPoints` | |
| Main competitors | `competitors` | |
| Average deal size | `dealSize` | |
| Average sales-cycle length | `salesCycle` | |

### Section 2 — Products / Services *(repeatable; 1 block per product)*
Per product: `name ★`, `category`, `keyFeatures` (3 bullets), `painSolved`, `valueProp`, `timeToValue`, `dealType` (One-time / Monthly retainer / Annual SaaS / Usage-based / Custom-enterprise), `acv` (avg contract value).

### Section 3 — Target Customers
| Field | Key | Notes |
|---|---|---|
| Target industries ★ | `targetIndustries` | |
| Company sizes (multi-select) | `companySizes[]` | 1-10 / 11-50 / 51-200 / 201-500 / 501-1000 / 1001-5000 / 5000+ |
| Job titles that sign the check ★ | `buyerTitles` | decision makers |
| Internal champions | `championRoles` | |
| Main pain before finding you ★ | `mainPain` | |
| Trigger events | `triggerEvents` | what makes them start looking |
| Cost of inaction | `costOfInaction` | |

### Section 4 — Messaging & Campaign Preferences
| Field | Key | Notes |
|---|---|---|
| Tone | `tone` | Professional&direct / Conversational&warm / Data-driven / Bold&energetic / Consultative |
| What's worked in outreach before | `whatWorked` | hooks, subject lines |
| Exclusions | `exclusions` | companies/industries/roles to avoid |
| 90-day goal ★ | `goal90day` | e.g. "15 qualified meetings/mo" |
| Website/brand reference permission | `websitePermission` | yes / no / with_approval |

### Section 5 — Sending Infrastructure & Volume  → *feeds Track B*
| Field | Key | Notes |
|---|---|---|
| Target outbound emails / month | `targetMonthlyVolume` | sizes domains+mailboxes |
| # LinkedIn accounts available | `linkedinAccounts` | |
| Preferred TLDs | `preferredTlds` | (infra actually forces `.com`) |
| Preferred brand word for domains | `brandWords` | defaults to domain name |
| Existing infra to preserve/avoid | `existingInfra` | |

### Section 6 — Optional Reference Materials
`referenceEmails` (paste high-performing emails), `notes` (anything else).

**Submit gate:** requires `businessDescription` + `goal90day`. On submit → sets `_intakeSubmittedAt` → **Track B infra auto-kicks**.

---

## NODE 5 — RESEARCH ▸ Company  *(Gate 1)*  — `gs-research-run`

**Inputs:** `domain` (company website, required) · optional `userContext` (structured: products / company / special-instructions) · optional uploaded `documents` (PDFs/decks/images read natively). Scrapes homepage + /products /services /solutions /about /platform via Jina.

**AI:** `claude-sonnet-4-6`, 4k tokens. "Senior B2B GTM researcher." User-supplied context is **authoritative** over scraped content.

**Output** → `companyData._initialResearchBrief`:
- `companyOverview` {name, size, stage, businessModel}
- `productsServices[]` {name, description, targetBuyer, differentiator} → seeds Gate 2
- `valuePropositions[]` {claim, evidence, quantified}
- `targetMarketEvidence` {industries, companySizes, knownCustomers}
- `competitivePositioning` {category, mainCompetitors, differentiators}
- `icpHypotheses[]` {name, rationale, confidence, signals}
- `recommendedAngles[]` {angle, why, bestChannel, suggestedHook}
- `callPrepNotes`, `confidenceNotes`

**Gate UI:** review brief → refine in chat → **Confirm** → auto-kicks Gate 2.

---

## NODE 6 — RESEARCH ▸ Products / Services  *(Gate 2)*  — `products-run`

**Inputs:** confirmed `_initialResearchBrief.productsServices` (or CSM-curated **product seed list** — add/rename/remove which products to profile) · optional `userContext`.

**AI:** `claude-sonnet-4-6`, ~3.5k tokens **per product**, streaming, sequential. Splits fields into **reasoning** (inferred from research) vs **evidence** (never fabricated — left blank if unsupported).

**Output** → `products[]`, each with **40+ fields**, grouped:
- *Identity:* name, description, category, useCases, keyFeatures, problemsSolved, valueProposition, timeToValue, idealCustomer, marketMaturity, competitors
- *Sales motion:* buyerObjections, switchTriggers, dealStakeholders, discountAuthority, paymentTerms, avgDaysToClose, closeRateByStage
- *Economics (evidence-gated):* dealType, acv, mrr, contractLength, renewalRate, expansionRevenue, ltv, avgDealSize, repeatRate, referralRate
- *Proof (evidence-gated):* proofPoints, roiMetrics, caseStudies, industryProof, socialProof
- *Messaging:* objectionRebuttals, unsolvedImpact, elevatorPitch, positioningStatement, messagingDos, messagingDonts, prod_notes

**Gate UI:** `ProductsReview.tsx` → review → confirm → auto-kicks Gate 3.

---

## NODE 7 — RESEARCH ▸ Market & ICPs  *(Gate 3)*  — `tam-icp-run`

**Inputs:** confirmed `products[]` + `_initialResearchBrief`.

**AI:** `claude-sonnet-4-6`, 8k tokens. "Senior B2B GTM strategist." Builds:
1. **Company-level TAM** + 2-4 broad segments
2. **Per-product TAM**, each branching into 1-3 ICPs (scope = `unique` or `cross_product`)
3. **Scores every ICP** on 5 weighted dimensions (1-10 + rationale):

| Dimension (`key`) | Label | Weight |
|---|---|---|
| `market_size` | Market Size & Accessibility | **0.20** |
| `pmf` | Product-Market Fit | **0.25** |
| `proof` | Proof Availability | **0.20** |
| `outreach` | Outreach Accessibility | **0.20** |
| `advantage` | Competitive Advantage | **0.15** |

`weightedScore = Σ(score × weight)` → ranked, with `recommendation` ∈ {launch_first, launch_second, test_small, defer, skip}.

**Outputs** (3 objects):
- `_tamTree` {companyLevel {tamSummary, segments[]}, perProduct[] {productName, tamSummary, icps[]}}
- `icps[]` {id, name "[Industry] — [Buyer Role]", data {industries, buyer, pain1, _tamScope, _tamExplanation}, linkedProductIds, linkedProductFit}
- `_icpScoringResult` {rubric, icps[] {icpId, icpName, dimensions[], weightedScore, rank, recommendation, topStrengths, topGaps, suggestedAngle, scope}}

**Gate UI:** `ICPScoringMatrix.tsx` (expandable dimension breakdown) → confirm → opens ICP picker for Gate 4.

---

## NODE 8 — CONFIGURE AI AGENTS ▸ Personas  *(Gate 4)*  — `personas-run`

> In B2B Rocket terms, a **persona = the AI sales agent's brain** — who it targets, what it says, how it qualifies.

**Inputs:** CSM **picks which scored ICPs** to build (`icpIds`; defaults to top-6 by rank, max 8) + `_icpScoringResult` + research brief.

**AI:** `claude-sonnet-4-6`, 6-8k tokens, **parallelized** across selected ICPs. Reasoning fields inferred; firmographic/intent specifics never fabricated.

**Output** → `icps[].data` enriched + `_personasGeneratedAt`. **30+ fields per persona:**
- *Firmographics:* industries, co_sizes, geo, revenue, tech, keywords, dream_accts
- *Buyer psychology:* buyer, champ, goals, fears, metrics, objections, sub_personas
- *Pain & triggers:* pain1, pain2, gains, triggers, buying_signals_direct/indirect, sq_cost, friction_points
- *Messaging:* tone, hook, cta, why_client_wins, icp_proof, seq_strategy, seq_cta_style
- *Competitive:* current_solutions, incumbent_strengths, switching_triggers, displacement_messaging, win_loss_patterns
- *Channel/timing:* best_channel, best_time, linkedin_activity, phone_accessibility, email_preference
- *Qualification ladder:* interested / warm / meeting_ready / not_now / dead criteria

**Gate UI:** `PersonasReview.tsx` → confirm → unlocks Gate 5.

---

## NODE 9 — CAMPAIGNS CREATED  *(Gate 5)*  — `EmailCampaignGenerator.tsx` (+ `launch-plan-run`)

**Inputs (per run):** pick `productId` + `personaId` + `playbookKey` (writing tone: Hormozi, Vaynerchuk, etc., or auto) + free-form `instructions` + optional `freeOffers`.

**AI:** `claude-sonnet-4-6` across ~5 calls. Generates strategy briefs, then sequences. Merge tags restricted to an allow-list; **compliance layer** scans spam words + applies spintax to email subject/body.

**Output per persona×product** → `companyData._campaignPlans[productId__personaId]`:
- `emailStrategy` + `linkedinStrategy` (briefs)
- **1 LinkedIn sequence** — 5 touches: connection request (≤300 chars) + 4 conversational DMs (≤500 chars), days 0/2/5/10/17
- **3 email campaigns** × 5 touches each (days 0/3/7/14/21, ≤100 words/email):
  1. **Conversation Starter** — value-first, soft CTA
  2. **Meeting CTA** — direct 15-min ask
  3. **Value-Based CTA** — specific free offer → meeting ask

**At scale, `launch-plan-run` (mode "plan")** orders the rollout: assigns top ICPs to LinkedIn accounts (1 each), queues **email waves one ICP at a time** (lowest unfinished rank first), and AI-picks the best campaign type per ICP {intent_signal, conversation_starter, free_value, meeting_booking}. Mode "generate" produces the actual copy per wave.

---

## NODE 10 — DOMAINS & MAILBOXES  *(Track B — PARALLEL)*  — `infra-run`

Kicks off on intake submit; sized from the form **with no dependency on Track A**.

**Inputs:** `infraInputs` (domainCount, mailboxCount, primaryWebsite, brandWord, forwardingDomain, mailboxNames[] with % distribution) — falls back to intake `targetMonthlyVolume` + `brandWords` + `co_website`.

**Sizing logic:**
- Explicit counts → use them
- Else from volume: `mailboxCount = ceil(volume / (30/day × 22 days))`, `domainCount = ceil(mailboxes / 3)`
- Else default: **67 domains / 201 mailboxes** (3 mailboxes/domain)

**AI:** mostly **deterministic** stem generation (21 prefixes × 25 suffixes off the brand word, `.com` only); `claude-haiku-4-5` only fills the gap if deterministic falls short.

**Output** → `companyData._dfySetup`: tlds, domainCount, mailboxCount, primaryWebsite, forwardingDomain, `mailboxNames[]` {name, percent, allocation}, `suggestedDomains[]` {full}, `mailboxes[]` {address, domain, senderName}, sizingBasis.

**Gate UI:** review domains/mailboxes → **Confirm & Lock** (one-time; locked after).

---

## NODE 11 — AUDIENCES CREATED  ⚠️ *gap / downstream*
Actual **lead lists** matching each confirmed ICP/persona (source + enrich contacts). **Not an edge function in the tool today** — personas define *who* to target; pulling the list is the next build. Show as a distinct node and mark as roadmap.

---

## NODE 12 — CLIENT + CSM REVIEW
Not one step — it's the **review→refine→confirm loop baked into every gate**. Each gate has: View artifact · Refine in chat (Copilot edits in place) · Regenerate · Confirm. Track A advances only on confirm; Track B locks on confirm.

## NODE 13 — LAUNCHED 🟢
`launch-plan-run` activates campaigns (status active), compliance-checked copy goes live across the confirmed mailboxes. Post-launch monitoring (deliverability, reply-rate, 300-delivered-per-reply pause rules) takes over.

---

## Miro layout suggestion
- **Swimlane 1 (top):** Track A sequential chain (5 gates) left→right, each as a card with its **Inputs / AI / Outputs** mini-table.
- **Swimlane 2 (bottom):** Track B infra running parallel under the form, with a dashed line from "Intake submitted" → "Infra auto-kicks."
- **Vertical "Review gate" stickies** between each Track-A node (review→refine→confirm).
- **Red TODO node** for Audiences/lead-lists.
- **Field appendix frame:** drop the intake-form tables verbatim as the "single source of truth."
