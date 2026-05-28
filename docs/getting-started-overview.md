# Getting Started: Client Onboarding Process

## What This Document Is

**Primary use:** Operational reference for account managers running onboarding. The Practical Workflow section below is the artifact you'll use most often.

**Secondary use:** Training material for new AMs learning the process end-to-end.

The process has two parts:
- **Steps 1–8: Platform-guided.** The Getting Started checklist in the product walks you through these.
- **Steps 9–14: Manual process.** Happen outside the platform. All of them are required before a campaign goes live.

---

## Quick Status Overview

| Area | Who | Status |
|------|-----|--------|
| Company research | System (AI) | ✅ In platform |
| Client intake collection | Client + AM | ✅ In platform |
| Profile synthesis | System (AI) | ✅ In platform |
| ICP mapping | System (AI) | ✅ In platform |
| ICP reconciliation | Account Manager | ⚠️ Manual checkpoint within platform flow |
| ICP scoring | System (AI) | ✅ In platform — no human gate yet *(Fix This Sprint)* |
| Campaign copy generation | System (AI) | ✅ In platform — single version only *(Fix This Sprint)* |
| Compliance requirements | AM | ❌ Manual, outside platform |
| Offer / CTA definition | AM + Client | ❌ Manual, outside platform |
| Success metric definition | AM + Client | ❌ Manual, outside platform |
| Sender infrastructure | AM | ❌ Manual, outside platform |
| Lead list building | AM | ❌ Manual, outside platform |
| A/B variant generation | AM | ❌ Manual — until sprint fix ships |
| Human approval gate | AM + Client | ❌ Manual — until sprint fix ships |
| Signal/trigger operationalization | — | 🗺️ Roadmap |
| Reply data feedback loop | — | 🗺️ Roadmap |
| Sequence branching logic | — | 🗺️ Roadmap |

---

## Fix This Sprint

Two product gaps are high-leverage and cheap to close. Both are blocking value the platform could deliver today.

**1. No human approval gate between scoring and campaign planning (Step 7 → 8)**  
The AI scores ICPs and campaign planning immediately unlocks — no step requires the AM to review and approve the rankings first. If the AI mis-scored an ICP because the client omitted key proof points, campaigns get written against the wrong target. Adding a "Review & Approve ICP Rankings" confirmation step between 7 and 8 is a one-screen change that prevents a class of failures.  
Owner: `[___]` — Target: `[___]`

**2. Only one version of each touch generated (Step 8)**  
The system produces one subject line and one body per touch. Without variants from day one, 2–3 weeks of send data are collected before A/B testing can begin. Generating two variants per touch at creation time unlocks A/B value immediately at no cost.  
Owner: `[___]` — Target: `[___]`

---

## Practical Workflow

This is the artifact for daily use. Full step details follow in the sections below.

**Before the kickoff call:**
- Run AI Research (Step 1) — takes a few minutes; do it as soon as the client domain is known
- While it runs, send the intake form link to the client (Step 3)
- When sending the link, explicitly ask the client to include past outreach sequences with reply rates if they have them — this data dramatically improves the copy in Step 8 and most clients won't include it without a specific ask
- Review the brief when ready (Step 2); note anything that looks wrong before the call so you can probe it

**During or immediately after the kickoff call:**
- Upload the transcript (Step 4)
- Start sender infrastructure setup and mailbox warming (Step 13) — this takes 2–4 weeks and is almost always the critical path to launch; starting it here is not optional

**Same day as call:**
- Profile synthesizes automatically (Step 5)
- Generate ICP tree (Step 6) — then pause for **Reconciliation Checkpoint 1**: does the AI's ICP map match what you heard on the call and in the intake? Resolve any disagreements before running scoring
- Run ICP scoring (Step 7) — then pause for **Reconciliation Checkpoint 2**: does the ranked list and the Launch First recommendation make sense given the client's sales cycle, proof availability, and near-term revenue needs? Resolve before proceeding
- Plan campaigns for the top ICP(s) (Step 8)
- Confirm compliance requirements (Step 9) — this determines which prospects can legally be contacted; it must happen before list building

**Next working session:**
- Define the offer with the client (Step 10)
- Define success metrics with the client (Step 11)
- Begin list building (Step 12) — can run in parallel with infrastructure warming

**2–4 weeks after kickoff (when mailboxes are warmed):**
- Review copy, create A/B variants, configure sequencer, run test sends, get client approval, launch (Step 14)

---

## What Can Happen in Parallel

```
Step 1 (AI Research)
       │
Step 2 (Review Brief)
       │
Step 3 (Send Intake) ──── Client Submits ──────────────────┐
                                                            │
Step 4 (Upload Transcript) ────────────────────────────────┤
                                                            │
                                              Step 5 (Synthesize Profile)
                                                            │
                                              Step 6 (ICP Tree)
                                          [Reconciliation Checkpoint 1]
                                                            │
                                              Step 7 (Score ICPs)
                                          [Reconciliation Checkpoint 2]
                                                            │
                                              Step 8 (Plan Campaigns)
                                          ┌─────────────────┤
                                          │                 │
                              Step 9 (Compliance)    Step 13 (Infrastructure)
                              Step 10 (Offer)         [starts at Step 7/8,
                              Step 11 (Metrics)        critical path, 2-4 weeks]
                                          │                 │
                              Step 12 (Lists) ─────────────┤
                                                            │
                                              Step 14 (Review, Approve & Launch)
```

**Steps 1–4 are mostly independent** — except Step 2, which requires Step 1 to finish. Steps 3 and 4 can overlap each other and Steps 1/2.

**Steps 5–8 are strictly sequential.** Each requires the previous to complete.

**After Step 8, the critical path splits.** Infrastructure (Step 13) should start as soon as the ICP is confirmed (as early as Step 7). Compliance, offer, and metrics (Steps 9–11) are planning decisions that need to be resolved before list building. Lists (Step 12) can run in parallel with infrastructure warming once compliance is confirmed.

---

## Platform-Guided Steps (1–8)

### Step 1 — Run Initial AI Research
**Who:** System (AI), triggered when you enter the client's domain  
**Unlocks:** Always available  
**What happens:**
1. The system visits the client's homepage and pulls relevant content.
2. It checks additional pages (Products, Services, About, Platform, Solutions) for more context.
3. An AI model reads all of it and produces a research brief covering:
   - What the company does and how it makes money
   - Key products/services and their differentiators
   - Apparent target customers
   - Competitive positioning
   - Hypotheses about who the ideal customer actually is
   - Suggested outreach angles and hooks
   - Things to validate or ask about on the onboarding call
   - AI's confidence level in its findings

**Output:** Structured research brief saved to the client record.  
**Time:** A few minutes. Progress appears in real time.

**Note:** The system only reads the client's public website. It has no access to CRM data, closed-won deal history, or past outreach performance — all stronger ICP signals than website copy. If the client has this data, it should come in through the intake form (Step 3) or be uploaded as reference material.

---

### Step 2 — Review Research Brief
**Who:** Account Manager  
**Unlocks:** After Step 1 completes  
**What happens:**
1. You read the AI-generated brief.
2. You click "Mark as Reviewed" when satisfied.

Read it critically — the brief's ICP hypotheses will influence the ICP tree in Step 6. If something looks wrong, note it so you can probe it on the call and correct it through the intake form or transcript.

**Output:** Brief marked reviewed.

---

### Step 3 — Share Client Intake Form
**Who:** Account Manager (shares link); Client (fills it out)  
**Unlocks:** Always available — send as early as possible, ideally before the kickoff call  
**What happens:**
1. You click "Copy Intake Link" and send it to the client.
2. The client fills out five sections:
   - **About Their Business** — core problem they solve, current customers, proof points, competitors, deal size, typical sales cycle
   - **Products/Services** — for each product: what it does, what pain it solves, value delivered, pricing structure
   - **Target Customers** — ideal industries, company sizes, buyer titles, what triggers a purchase, cost of inaction
   - **Messaging Preferences** — tone, what's worked before, what to avoid, 90-day goal, whether the website can be referenced
   - **Optional Materials** — example past emails, case studies, or any reference content
3. On submission, the form is saved to the client record with a timestamp.

**Note:** When sending the link, explicitly ask the client to include past outreach sequences with their reply rates in Optional Materials. "What's worked" as free text is far less useful to the AI than actual sequence data with performance numbers. Most clients won't include this without a direct ask.

**Note:** The form does not explicitly ask for the client's preferred CTA or offer (the specific ask in every outreach touch). If the client already knows what they want — "15-minute call," "free audit," "demo" — encourage them to include it in Notes. It will produce more consistent output in Step 8 and you'll confirm it formally in Step 10.

---

### Step 4 — Upload Onboarding Call Transcript
**Who:** Account Manager  
**Unlocks:** Always available  
**What happens:**
After the kickoff call, upload the transcript. The system recognizes it as an onboarding/kickoff call and marks this step complete. Profile synthesis (Step 5) triggers automatically.

**Note:** Steps 3 and 4 can happen in any order and can overlap.

---

### Step 5 — Synthesize Company Profile
**Who:** System (AI)  
**Unlocks:** After Step 3 OR Step 4 is complete  
**What happens:**
The AI merges all available inputs — intake form, call transcript, research brief — into a unified company profile: name, pitch, product summary, full product/service catalog, target personas, value props, proof points, messaging preferences.

**Output:** Complete company profile. All remaining steps draw from it.

---

### Step 6 — Generate ICP Tree
**Who:** System (AI)  
**Unlocks:** After Step 5 completes  
**What happens:**
The AI builds a hierarchical map of the client's Ideal Customer Profiles:
- Types of companies that are the best fit
- Personas (job titles/roles) within those companies
- Jobs those personas are trying to get done
- Events or situations that trigger a buying decision
- Suggested outreach plays per scenario

**Output:** Structured ICP tree.

**Reconciliation Checkpoint 1 — pause here:** Before scoring runs, verify that the AI's ICP map matches what you heard on the call and read in the intake form. See the [ICP Reconciliation](#icp-reconciliation) section.

**Note:** The trigger events in the tree (funding rounds, hiring spikes, leadership changes, tech-stack changes) are documented but not connected to anything live. Making triggers operational — routing high-signal prospects to the front of the sequence queue when a trigger fires — is a roadmap item.

---

### Step 7 — Score & Prioritize ICPs
**Who:** System (AI)  
**Unlocks:** After Step 6 completes  
**What happens:**
The AI evaluates each ICP across five weighted dimensions:

| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| Product-Market Fit | 25% | How well the product solves a real, urgent pain for this ICP |
| Market Size & Accessibility | 20% | How large and reachable this market is |
| Proof Availability | 20% | How much existing evidence (case studies, logos, results) supports this ICP |
| Outreach Accessibility | 20% | How easy it is to find and contact decision-makers in this segment |
| Competitive Advantage | 15% | How strong the client's differentiation is in this space |

Each ICP receives a score per dimension (0–10), a weighted overall score, and a recommendation: **Launch First / Launch Second / Test Small / Defer / Skip**, plus top strengths, gaps, and best outreach angle.

**Output:** Ranked ICP list.

**Reconciliation Checkpoint 2 — pause here:** Review the ranked list before campaign planning unlocks. See the [ICP Reconciliation](#icp-reconciliation) section.

**Note:** Two factors the rubric doesn't currently score — sales cycle length and willingness/ability to pay — can override a high overall score. An ICP that scores well on all five dimensions but has a 9-month sales cycle is a poor Launch First choice if the client needs near-term revenue. Until these are added to the rubric (roadmap), surface them manually as a caveat alongside the recommendation. See [Roadmap](#roadmap).

**Sprint fix needed:** There is currently no platform-enforced gate between this step and Step 8. The AM must manually pause here — this is the Reconciliation Checkpoint 2 moment. When the sprint fix ships, this becomes an explicit approval step in the product.

---

### Step 8 — Plan Email + LinkedIn Campaigns
**Who:** System (AI), for whichever ICP(s) you select  
**Unlocks:** After Step 7 completes  
**What happens:**
For each selected ICP, the AI generates a 5-touch sequence for email and LinkedIn.

**Email Sequence:**
| Touch | Timing | Focus |
|-------|--------|-------|
| 1 | Day 0 | Hook — lead with numbers or offer free value upfront |
| 2 | Day 3 | Proof — social proof or customer story |
| 3 | Day 7 | Reframe — challenge a misconception or contrarian angle |
| 4 | Day 14 | Urgency — amplify the pain or introduce FOMO |
| 5 | Day 21 | Breakup — honest, final message |

**LinkedIn Sequence:**
| Touch | Timing |
|-------|--------|
| 1 | Day 0 — Connection request + message |
| 2 | Day 2 |
| 3 | Day 5 |
| 4 | Day 10 |
| 5 | Day 17 |

For every touch: full body, subject line (email), GTM angle, and target persona.

**Output:** Complete campaign plan saved to the client record.

**Note:** Single version per touch only — no A/B variants. (See Fix This Sprint.)

**Note:** Sequences are linear. There is no branching logic — every prospect follows the same 5 touches regardless of engagement. Branching rules must be configured manually in the sending tool after export. See [Roadmap](#roadmap).

**Note:** Email + LinkedIn only. For high-ACV ICPs ($50k+), phone, warm introductions, and paid retargeting are standard parts of a complete outbound motion. The platform does not plan for these.

---

## ICP Reconciliation {#icp-reconciliation}

This is the highest-judgment work in the onboarding. It happens at two distinct moments.

**Why it exists:** The AI builds its ICP picture from the client's public website, an intake form, and a transcript. For a meaningful fraction of clients — especially early-stage ones — the onboarding *is* where they figure out who they're actually selling to. The AI's inferred ICP and the client's stated ICP will sometimes disagree, and neither is automatically correct.

**Checkpoint 1 — after Step 6 (tree review):**  
Does the AI's ICP map reflect what you heard on the call and read in the intake? Look for:
- ICPs the AI included that the client never mentioned and would likely reject
- ICPs the client mentioned that the AI missed or under-weighted
- Personas listed that don't match the actual buyer in the client's experience

**Checkpoint 2 — after Step 7 (scoring review):**  
Does the ranked list and the Launch First recommendation make sense given what you know about the client's situation? Look for:
- An ICP scoring Launch First that has a long sales cycle the rubric didn't penalize
- A ranking that would work for a company with a mature proof library, but not for this client who has few case studies
- Any score that was inflated by optimistic intake language that you know from the call doesn't hold up

**Who resolves disagreements:** The account manager, in conversation with the client if needed. The outcome should be documented in the client record — either confirming the AI's output or noting where and why it was adjusted.

**Why this matters:** If reconciliation doesn't happen explicitly at both checkpoints, it happens implicitly (the AM has a vague sense something is off but proceeds anyway) or not at all. The error then propagates through scoring, into campaign copy, into list targeting, and eventually into performance data that's misleading because it's measuring the wrong ICP.

---

## Manual Process Steps (9–14)

These happen outside the platform. All are required before a campaign goes live.

### What's intentionally manual vs. what should eventually be in the platform

Not all manual steps are manual for the same reason. This distinction matters for roadmap decisions.

| Step | Manual because... | Direction |
|------|------------------|-----------|
| 9 — Compliance | Not yet built into platform | → Platform-guided checklist |
| 10 — Offer definition | The client must commit to a CTA; this is AM-client work | Intentionally human — platform can support (e.g., prompt in Step 3), not replace |
| 11 — Success metrics | Requires AM judgment on what's realistic for this client | Intentionally human — platform can surface benchmarks, AM sets the target |
| 12 — List building | Not yet integrated | → Platform-guided or integrated |
| 13 — Sender infrastructure | Involves external tools and account-level decisions | Partially automatable (domain config checklist); compliance and LinkedIn health remain human |
| 14 — Review & launch | Client approval is intentionally human | Intentionally human — platform can streamline (e.g., approval gate, variant generation), not replace |

The ICP reconciliation checkpoints and the offer/metrics conversations are where the AM earns their value. Automating them out of existence would degrade the output, not improve it.

---

### Step 9 — Confirm Compliance Requirements
**Who:** Account Manager  
**When:** Immediately after Step 8 — before list building begins  
**Why this comes first:** Compliance requirements are determined by where your prospects are located, not by how your infrastructure is configured. Building a list that includes EU prospects before confirming GDPR applies is the wrong order — you may need to exclude segments, change your lawful basis approach, or add fields to your suppression workflow. Confirm jurisdiction first.

**What happens:**
1. Identify where the target prospects are located based on the ICP criteria from Step 7.
2. For each jurisdiction, confirm requirements:

**United States — CAN-SPAM:**
- Physical address in every email
- Clear identification of the sender
- Functioning one-click unsubscribe
- Honor unsubscribe requests within 10 business days
- No deceptive subject lines or headers

**Canada — CASL:**
Stricter than CAN-SPAM. Requires implied or express consent before sending to Canadian recipients. Implied consent applies if there is an existing business relationship (e.g., the prospect is a former customer or has explicitly inquired). Cold prospecting to contacts with no prior relationship requires express consent, which is difficult to obtain without first contacting them — a structural constraint. If the client has Canadian prospects, get a specific CASL assessment before sending.

**European Union — GDPR:**
Materially different from CAN-SPAM. The most commonly used lawful basis for B2B cold email is Legitimate Interest, but it requires:
- A documented Legitimate Interest Assessment (LIA) — a balancing test showing the sender's interest outweighs the prospect's privacy interests
- A clear opt-out mechanism in every message
- A suppression list that persists across campaigns
- Prompt response to Subject Access Requests (SARs) and erasure requests

Getting GDPR wrong is expensive. If the client is sending to EU contacts, this is a separate compliance track requiring a proper legal review — not a checkbox.

3. Document which jurisdictions apply and what obligations are active before list building starts.

**Output:** Written record of compliance requirements per jurisdiction, confirmed before any list is built.

---

### Step 10 — Define the Offer
**Who:** Account Manager + Client  
**When:** After Step 9; before list building begins  
**What happens:**
Agree with the client on the specific action every outreach sequence asks the prospect to take. This is a strategic decision — it belongs here, not inside the sequence writing in Step 8.

Common options:
- 15–20 minute intro call
- Free audit or teardown
- Demo or walkthrough
- Access to a report, benchmark, or tool
- Warm introduction through a mutual connection

The offer affects everything downstream: list targeting (some offers work better with certain company sizes), copy tone, and what success looks like. A vague offer ("let's connect") produces vague copy. A specific offer produces specific copy and gives the prospect a clear reason to reply.

**Output:** A one-sentence offer statement: what you're offering, to whom, and why now. Documented in the client record.

---

### Step 11 — Define Success Metrics
**Who:** Account Manager + Client  
**When:** After Step 10; before list building begins  
**What happens:**
Agree on what good looks like for this campaign, per ICP.

Set benchmarks for:
- **Reply rate** (all replies / emails delivered) — cold B2B benchmarks: 2–5% is reasonable, 5–8% is strong
- **Positive reply rate** (interested replies / emails delivered) — target: 1–2%
- **Meeting booked rate** (meetings / emails delivered)
- **Review timeline** — how many weeks and how many delivered emails before re-evaluating the ICP hypothesis

Without agreed baselines, week-2 performance data has no interpretation. You can't distinguish between "the ICP is wrong," "the offer is wrong," "the copy is wrong," and "the list is wrong" — because you never defined what wrong looks like.

**Output:** Benchmark document or note in the client record with expected ranges per ICP and a named review date.

---

### Step 12 — Build Lead Lists
**Who:** Account Manager  
**When:** After Step 9 (compliance confirmed); can run in parallel with Step 13 (infrastructure warming)  
**What happens:**
Build the prospect lists that the campaigns from Step 8 will run against.

1. **Source prospects** using the ICP criteria from Step 7 in your prospecting tool (Apollo, LinkedIn Sales Navigator, Clay, ZoomInfo, etc.). Filter by industry, company size, geography, tech stack, growth signals.
2. **Enrich records.** Verify email addresses and LinkedIn URLs. Flag low-confidence records for manual review.
3. **Apply suppression.** Remove: existing customers, competitors, contacts already in the CRM, previous bounces, unsubscribes, and any contacts excluded by the compliance requirements confirmed in Step 9.
4. **Validate list size.** Confirm there are enough records to generate statistically meaningful performance data. A list of 50 prospects will not tell you whether the ICP hypothesis is right.

**Output:** Verified, enriched, suppressed lead list segmented by ICP, ready to load into the sending tool.

---

### Step 13 — Set Up Sender Infrastructure
**Who:** Account Manager  
**When:** Starts as soon as the ICP is confirmed (Step 7 or Step 8) — this takes 2–4 weeks and is almost always the critical path to launch  

**Domain setup:**
- Purchase secondary sending domains (not the client's primary domain)
- Configure SPF, DKIM, and DMARC DNS records for each domain
- Verify records have propagated before warming begins

**Mailbox warming:**
- New mailboxes require 2–4 weeks of warm-up activity before cold volume begins
- Use a warming tool or manual warm-up protocol
- Do not send cold outreach from unwarmed mailboxes — deliverability damage is immediate and hard to reverse

**Sending limits:**
- Set per-mailbox daily limits (typically 30–50 emails/day for new domains, scaling up over weeks)
- Plan mailbox count based on target send volume

**LinkedIn account health:**
- Confirm sender accounts are in good standing
- Set connection request limits within safe ranges (typically 15–25/day without Sales Navigator)
- Do not run high volume from recently flagged or restricted accounts

**Output:** Warmed sending domains with verified DNS, configured mailboxes within send limits, confirmed LinkedIn account health.

---

### Step 14 — Review, Approve & Launch
**Who:** Account Manager + Client  
**When:** After all of Steps 9–13 are complete and sender infrastructure is warmed  

1. **Copy review.** AM and client read every touch across both channels. Pay particular attention to proof points and case studies — the AI may have over-claimed if intake data was thin.
2. **Create A/B variants.** Generate at minimum two subject line variants and two body variants per touch. Load them into the sending tool so rotation and tracking begin from day one. (When the Step 8 sprint fix ships, this step is eliminated.)
3. **Configure the sequencer.** Load sequences with correct timing, personalization variables, and any available branching rules (at minimum: stop on reply, pause on out-of-office).
4. **Test sends.** Send samples to internal addresses. Check rendering in Gmail, Outlook, and on mobile. Confirm links, tracking, and unsubscribe mechanisms work. Verify inbox placement on a fresh test account.
5. **Client sign-off.** Get explicit approval before volume begins.

**Output:** Campaign live in sending tool, leads loaded, test sends passed, client approved.

---

## Roadmap {#roadmap}

These capabilities do not exist yet. Each is described with what triggers it, who acts, and what happens — so it reads as a specification, not a wishlist.

**ICP scoring: sales cycle length and willingness to pay**  
*What it is:* Two dimensions missing from the current scoring rubric. An ICP can score well on all five existing dimensions but be a poor Launch First choice due to a 9-month average sales cycle or a buyer that underspends relative to the product's price point.  
*How to fix:* Add "Sales Cycle & Velocity" (weight TBD) and "Deal Economics" (weight TBD) as dimensions. Inputs come from the intake form deal size and sales cycle fields already collected.

**ICP re-ranking after first performance data**  
*Trigger:* 4–6 weeks after launch, or after 200+ emails delivered to a given ICP  
*Who acts:* System flags; AM reviews  
*What happens:* Actual reply rate and positive reply rate are compared to the benchmarks set in Step 11. If an ICP significantly underperforms, the system surfaces a prompt to re-evaluate its Step 7 scoring — either updating the rubric inputs or revising the ICP definition. Other ICPs in the tree are re-ranked accordingly.

**Signal-based prospect routing**  
*Trigger:* A monitoring layer detects a trigger event (funding round, leadership hire, job posting matching a buying signal, tech-stack change) for a company matching a scored ICP  
*Who acts:* System routes; AM optionally reviews before send  
*What happens:* High-signal prospects are elevated to the front of the sequence queue and may receive a variant touch referencing the specific trigger. This operationalizes the trigger events currently documented in Step 6.

**Sequence branching**  
*Trigger:* A prospect engages (opens, clicks, replies, connects on LinkedIn) or disengages (negative reply, unsubscribe)  
*Who acts:* System routes automatically  
*What happens:* Prospects are routed to alternative follow-up paths based on engagement. A prospect who opened three times without replying gets a different Touch 2 than one who never opened. A LinkedIn connection who accepted gets accelerated to direct email sooner.

**Sequence performance feeding back into copy generation**  
*Trigger:* Statistically significant A/B test results (500+ sends per variant)  
*Who acts:* System surfaces; AM reviews and applies  
*What happens:* Variants that outperform are flagged. The AI uses this performance data as context when generating sequences for future clients with similar ICP profiles.
