# Getting Started: Client Onboarding Process

## What This Document Is

This document covers the full onboarding process from first research to first send. It is split into two parts:

- **Steps 1–8: Platform-guided flow.** The system automates or assists each of these steps. This is what the Getting Started checklist in the product walks you through.
- **Steps 9–13: Manual process steps.** These happen outside the platform today, managed by the account manager. They are documented here because skipping any of them will cause the campaign to underperform or fail entirely. These are candidates for future product automation.

**The platform's current scope:** The Getting Started checklist takes a client from zero to a finished campaign plan — copy written, ICPs prioritized, sequences structured. It does not yet cover list building, sender infrastructure, compliance, or launch approval. Those are Steps 9–13.

---

## Quick Status Overview

| Area | Who | Platform? |
|------|-----|-----------|
| Company research | System (AI) | ✅ Automated |
| Client intake collection | Client + AM | ✅ Guided |
| Profile synthesis | System (AI) | ✅ Automated |
| ICP mapping | System (AI) | ✅ Automated |
| ICP reconciliation (AI vs. client's stated ICP) | Account Manager | ⚠️ Manual checkpoint |
| ICP scoring | System (AI) | ✅ Automated (no approval gate yet — see Fix This Sprint) |
| Campaign copy generation | System (AI) | ✅ Automated (single version only — see Fix This Sprint) |
| Offer / CTA definition | AM + Client | ❌ Manual, outside platform |
| Success metric definition | AM + Client | ❌ Manual, outside platform |
| Lead list building | AM | ❌ Manual, outside platform |
| Sender infrastructure | AM | ❌ Manual, outside platform |
| Compliance review | AM | ❌ Manual, outside platform |
| A/B variant generation | AM | ❌ Manual, outside platform |
| Human approval gate | AM + Client | ❌ Manual, outside platform |
| Signal/trigger operationalization | — | 🗺️ Roadmap |
| Reply data feedback loop | — | 🗺️ Roadmap |
| Sequence branching logic | — | 🗺️ Roadmap |

---

## Fix This Sprint

Two gaps in the current platform are high-leverage and cheap to close. Both are documented in the steps below, but called out here because they are product fixes measurable in days, not architectural changes:

1. **No human approval gate before campaigns are written (Step 7 → 8 transition).** The AI scores ICPs and the system immediately unlocks campaign planning — there is no step where the account manager reviews and approves the ranked ICPs before copy is generated. If the AI mis-scores an ICP (e.g., because the client omitted key proof points in the intake form), campaigns get written against the wrong target first. Adding a "Review & Approve ICP Rankings" step between 7 and 8 is a one-screen change that prevents a class of failures.

2. **Only one version of each touch is generated (Step 8).** The system produces one subject line and one body per touch, per channel. Without A/B variants from launch day, the first 2–3 weeks of performance data is collected on a single version before testing can begin. Generating two variants per touch at creation time would unlock A/B value immediately.

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
**Time:** A few minutes. Progress appears in real time ("Fetching homepage…", "Analyzing with Claude…").

**Limitation:** The system only reads the client's public website. It has no access to their CRM data, closed-won deal history, or past outreach performance — all of which are stronger ICP signals than website copy. If the client has this data, it should come in through the intake form (Step 3) or be uploaded as reference material.

---

### Step 2 — Review Research Brief
**Who:** Account Manager  
**Unlocks:** After Step 1 completes  
**What happens:**
1. You read the AI-generated brief.
2. You click "Mark as Reviewed" when satisfied.

**Why this matters:** This is the first place where the AI's inferred picture of the client's business may diverge from reality. Read it critically — the brief's ICP hypotheses and outreach angles will influence the ICP tree in Step 6. If something is obviously wrong, note it before the call so you can correct it in the intake form or transcript.

**Output:** Brief marked reviewed. Does not unlock any downstream step directly — the chain continues through Steps 3 and 4.

---

### Step 3 — Share Client Intake Form
**Who:** Account Manager (shares link); Client (fills it out)  
**Unlocks:** Always available — send it as early as possible, ideally before the kickoff call  
**What happens:**
1. You click "Copy Intake Link" and send it to the client.
2. The client fills out five sections independently:
   - **About Their Business** — core problem they solve, current customers, proof points, competitors, deal size, typical sales cycle
   - **Products/Services** — for each product: what it does, what pain it solves, value delivered, pricing structure
   - **Target Customers** — ideal industries, company sizes, buyer titles, what triggers a purchase, cost of inaction
   - **Messaging Preferences** — tone, what's worked before, what to avoid, 90-day goal, whether the website can be referenced
   - **Optional Materials** — example past emails, case studies, or any reference content
3. On submission, the form is automatically saved to the client record with a timestamp.

**Two things that would significantly improve the output of Step 8:**
- **The specific offer/CTA.** The intake form asks about goals and tone, but doesn't ask what concrete action the client wants outreach to drive — demo, audit, intro call, free teardown, etc. This gets captured in Step 9, but if the client knows it upfront, adding it to Optional Materials now will produce better copy.
- **Actual past sequences with reply rates.** The form asks "what's worked in past outreach" as free text. Pasting in real past sequences alongside their open/reply rates is far more useful to the AI than a description. Encourage clients to include this in Optional Materials.

---

### Step 4 — Upload Onboarding Call Transcript
**Who:** Account Manager  
**Unlocks:** Always available  
**What happens:**
1. After the kickoff call, you upload the transcript.
2. The system recognizes it as an onboarding/kickoff call and marks this step complete.

**Note:** Steps 3 and 4 can happen in any order and can overlap. The profile synthesis in Step 5 triggers as soon as either one is complete.

---

### Step 5 — Synthesize Company Profile
**Who:** System (AI)  
**Unlocks:** After Step 3 OR Step 4 is complete (whichever comes first)  
**What happens:**
The AI merges all available inputs — intake form, call transcript, research brief — into a unified company profile:
- Company name, pitch, product summary
- Full product/service catalog with value props
- Target personas
- Proof points and messaging preferences

**Output:** A complete company profile that all remaining steps draw from.

---

### Step 6 — Generate ICP Tree
**Who:** System (AI)  
**Unlocks:** After Step 5 completes  
**What happens:**
The AI builds a hierarchical map of the client's Ideal Customer Profiles:
- The types of companies that are the best fit
- The personas (job titles/roles) within those companies
- The jobs those personas are trying to get done
- Events or situations that trigger a buying decision
- Suggested outreach plays per scenario

**Output:** A structured ICP tree.

**Important — ICP reconciliation checkpoint:** This is where the AI's inferred view of the ideal customer and the client's stated view are most likely to diverge. Before proceeding to scoring, the account manager should verify that the tree matches what was said on the call and in the intake form. If it doesn't, the discrepancy should be resolved now — not after campaigns are written. See the [ICP Reconciliation](#icp-reconciliation) section below.

**Current limitation:** The trigger events in the tree (funding rounds, hiring spikes, leadership changes, tech-stack changes) are documented but not connected to anything live. No monitoring runs against them. The campaigns in Step 8 are static — they don't fire when a trigger occurs. Making triggers operational is a roadmap item.

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

Each ICP receives:
- A score per dimension (0–10)
- A weighted overall score
- A recommendation: **Launch First / Launch Second / Test Small / Defer / Skip**
- Top strengths, gaps, and the best outreach angle

**Output:** Ranked ICP list with prioritization guidance.

**Known gaps in the scoring rubric:**
- **Sales cycle length** is not a factor. An ICP can score well on all five dimensions but have a 9-month sales cycle, making it a poor Launch First candidate if the client needs near-term revenue. This should be surfaced as a caveat alongside each recommendation.
- **Willingness/ability to pay** is not explicitly scored. "Market Size & Accessibility" is close but conflates market size with purchasing power.

**Sprint fix needed here:** There is currently no approval gate between Step 7 and Step 8. As soon as scoring completes, campaign planning unlocks. The AM should manually pause here, review the ranked list, and confirm it makes sense before proceeding. This manual review should eventually become an explicit platform step.

---

### Step 8 — Plan Email + LinkedIn Campaigns
**Who:** System (AI), for whichever ICP(s) you select  
**Unlocks:** After Step 7 completes  
**What happens:**
For each selected ICP, the AI generates a 5-touch sequence for both email and LinkedIn.

**Email Sequence:**
| Touch | Timing | Focus |
|-------|--------|-------|
| 1 | Day 0 | Hook — lead with numbers or offer free value upfront |
| 2 | Day 3 | Proof — social proof or customer story |
| 3 | Day 7 | Reframe — challenge a misconception or take a contrarian angle |
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

For every touch, the AI writes the full body, a subject line (email), the GTM angle being used, and which persona it targets.

**Output:** Complete campaign plan saved to the client record.

**Current limitations:**
- **Single version per touch.** One subject line, one body. No A/B variants are generated. (See Fix This Sprint.)
- **No branching logic.** Every prospect follows the same 5-touch path regardless of how they respond. A prospect who opens but doesn't reply gets the same follow-up as one who never opened. Branching rules must be configured manually in the sending tool after export.
- **Email + LinkedIn only.** For high-ACV ICPs ($50k+), phone, warm introductions, and paid retargeting are typically part of a complete outbound motion. The platform does not plan for these.

---

## ICP Reconciliation {#icp-reconciliation}

This is the highest-judgment work the account manager does in the entire onboarding. It happens between Steps 6 and 7 (after the ICP tree is generated, before scoring runs) and again when reviewing the scoring output before Step 8.

**The problem it addresses:** The AI builds its picture of the ideal customer from the company's public website, an intake form, and a transcript. For a meaningful fraction of clients — especially early-stage ones — the onboarding *is* where they figure out who they're really selling to. The AI's inferred ICP and the client's stated ICP will sometimes disagree, and neither one is automatically correct.

**What reconciliation looks like:**
- The AI tree shows "VP of Engineering at Series B SaaS companies" but the client's three biggest wins are mid-market manufacturing companies — the intake form just didn't capture the wins clearly
- The client says "we sell to CMOs" but the research brief and transcript suggest actual buying authority sits with RevOps leads
- The AI infers high product-market fit with one ICP based on website language, but the client knows from experience that segment churns

**Who resolves it:** The account manager, in conversation with the client if needed. The outcome should be documented — either confirming the AI's tree or noting where and why it was adjusted — so that the ICP scoring in Step 7 is applied to the right targets.

**Why it matters:** If this reconciliation doesn't happen explicitly, it happens implicitly (or not at all), and the error propagates through scoring into campaign copy, list building, and eventually into performance data that's misleading because it's measuring the wrong ICP.

---

## Manual Process Steps (9–13)

These steps happen outside the platform. The account manager is responsible for completing all of them before the campaign goes live. Future versions of the platform may automate or guide some of these.

---

### Step 9 — Define the Offer
**Who:** Account Manager + Client  
**When:** After Step 8 (campaigns planned), before list building begins  
**What happens:**
Agree with the client on the specific action every outreach sequence is asking the prospect to take. This is a strategic decision, not a copy decision — it belongs here, not inside the sequence writing.

Common options:
- 15–20 minute intro call
- Free audit or teardown
- Demo or walkthrough
- Access to a report, benchmark, or tool
- Warm introduction through a mutual connection

**Why this is a separate step from campaign writing:** The AI in Step 8 may vary the ask across touches or hedge toward a vague "let's connect" if no specific offer is defined. A locked offer gives every touch a consistent anchor. It also affects list targeting — some offers work better with certain company sizes or personas.

**Output:** A written offer statement agreed with the client (one sentence: what you're offering, to whom, and why now).

---

### Step 10 — Define Success Metrics
**Who:** Account Manager + Client  
**When:** After Step 9, before list building begins  
**What happens:**
Agree on what good looks like for this campaign, broken down by ICP. This is an analytical agreement, not a creative one — do it separately from defining the offer.

Set benchmarks for:
- **Reply rate** (all replies / emails delivered) — cold B2B benchmarks: 2–5% is reasonable, 5–8% is strong
- **Positive reply rate** (interested replies / emails delivered) — target: 1–2%
- **Meeting booked rate** (meetings / emails delivered)
- **Timeline** — how many weeks of data before re-evaluating the ICP hypothesis

**Why this matters:** Without agreed baselines going in, week-2 performance has no interpretation. You can't tell whether a 1.5% reply rate means the ICP is wrong, the offer is wrong, the copy is wrong, or the list is wrong — because you never defined what "wrong" looks like. A simple benchmark agreement at this stage transforms performance data from noise into signal.

**Output:** A shared benchmark document or note in the client record with expected ranges per ICP and a review date.

---

### Step 11 — Build Lead Lists
**Who:** Account Manager  
**When:** After Step 9 and 10, can run in parallel with Step 12  
**What happens:**
Build the prospect lists that the campaigns from Step 8 will run against.

1. **Source prospects.** Use the ICP criteria from Step 7 to filter in your prospecting tool (Apollo, LinkedIn Sales Navigator, Clay, ZoomInfo, etc.). Filter by industry, company size, geography, tech stack, and any signals available (hiring activity, funding, growth rate).
2. **Enrich records.** Verify email addresses and LinkedIn URLs. Flag records with low confidence scores for manual review before sending.
3. **Apply suppression.** Remove:
   - Existing customers
   - Competitors
   - Contacts already in the CRM
   - Previous bounces and unsubscribes
   - Anyone who has explicitly opted out of contact from this sender
4. **Validate list size.** Confirm the list is large enough to generate statistically useful performance data. A list of 50 prospects will not tell you whether the ICP hypothesis is right.

**Output:** Verified, enriched, suppressed lead list segmented by ICP, loaded into the sending tool.

---

### Step 12 — Set Up Sender Infrastructure
**Who:** Account Manager  
**When:** Should begin as soon as the ICP is confirmed in Step 7 — this takes 2–4 weeks and is almost always the critical path to launch  
**What happens:**

**Domain setup:**
- Purchase secondary sending domains (not the client's primary domain)
- Configure DNS records: SPF, DKIM, and DMARC for each sending domain
- Verify records are propagated correctly before warming begins

**Mailbox warming:**
- New mailboxes need 2–4 weeks of warm-up activity before cold volume begins
- Use a warming tool (Mailreach, Warmup Inbox, etc.) or a manual warm-up protocol
- Do not send cold outreach from unwarmed mailboxes — deliverability will be immediately damaged

**Sending limits:**
- Set per-mailbox daily send limits (typically 30–50 emails/mailbox/day for new domains, scaling up over weeks)
- Plan mailbox count based on target send volume and these limits

**LinkedIn account health:**
- Confirm the sender's LinkedIn account is in good standing
- Set connection request limits within safe ranges (typically 15–25/day for accounts without Sales Navigator, more with)
- Do not run high volume from accounts that have been recently flagged or restricted

**Compliance — email:**
Cold email compliance varies by jurisdiction. The minimum for any campaign:
- **CAN-SPAM (United States):** Physical address in every email, clear identification of the sender, functioning unsubscribe mechanism, honor unsubscribe requests within 10 business days
- **CASL (Canada):** Implied or express consent required before sending; stricter than CAN-SPAM; Canadian recipients need specific handling
- **GDPR (European Union):** Materially different from CAN-SPAM. Legitimate interest is the most commonly used lawful basis for B2B cold email, but it requires a documented balancing test, a clear opt-out in every message, and a suppression mechanism. If the client has EU prospects, get a proper compliance review before sending — a GDPR enforcement action is expensive. This is not a sub-bullet; it is a separate compliance track.

**Output:** Warmed sending domains, configured mailboxes, confirmed LinkedIn account health, compliance requirements documented.

---

### Step 13 — Review, Approve & Launch
**Who:** Account Manager + Client  
**When:** After Steps 11 and 12 are complete; sender infrastructure is warmed and ready  
**What happens:**

1. **Copy review.** Account manager and client read every touch across both channels. Edit for accuracy, brand voice, and any client-specific sensitivities. Pay particular attention to proof points and case studies — the AI may have invented or misattributed them if the intake data was thin.
2. **Create A/B variants.** Generate at minimum two subject line variants and two body variants per touch. Load them so the sending tool can rotate and track performance from day one. (This becomes unnecessary once the platform generates variants in Step 8 — see Fix This Sprint.)
3. **Configure the sequencer.** Load sequences into the sending tool with correct timing, personalization variables, and any branching rules available (at minimum: stop sequence on reply, pause on out-of-office).
4. **Run test sends.** Send sample emails to internal addresses. Check rendering in Gmail, Outlook, and on mobile. Verify that links, tracking, and unsubscribe mechanisms work correctly. Check that the emails land in the inbox (not spam) on a fresh test account.
5. **Client sign-off.** Get explicit approval from the client before volume begins.

**Output:** Campaign live in sending tool, leads loaded, test sends passed, client has approved.

---

## What Can Happen in Parallel

```
Step 1 (AI Research)
       │
Step 2 (Review Brief) ───────────────────────────────────────────┐
                                                                   │
Step 3 (Intake Form) ─────── Client Submits ─────────────────────┤
                                                                   │
Step 4 (Upload Transcript) ──────────────────────────────────────┤
                                                                   │
                                                     Step 5 (Synthesize Profile)
                                                                   │
                                                     Step 6 (Generate ICP Tree)
                                                                   │
                                               [ICP Reconciliation — AM review]
                                                                   │
                                                     Step 7 (Score ICPs)
                                               [AM reviews ranking before proceeding]
                                                                   │
                                                     Step 8 (Plan Campaigns)
                                                                   │
                                          ┌────────────────────────┤
                                          │                         │
                                  Step 9 (Define Offer)    Step 12 (Sender Infrastructure)
                                  Step 10 (Define Metrics)     [starts here, 2-4 weeks]
                                          │                         │
                                  Step 11 (Build Lists) ───────────┤
                                                                    │
                                                      Step 13 (Review, Approve & Launch)
```

Steps 9, 10, and 12 can all begin after Step 8 completes. Steps 11 and 12 can run in parallel. Step 13 requires all three to be done.

Step 12 (sender infrastructure) is almost always the critical path — start it as soon as the ICP is confirmed, not after campaigns are written.

---

## Practical Workflow

**Before the kickoff call:**
- Run AI Research (Step 1) — takes a few minutes
- While it runs, send the intake form to the client (Step 3)
- Review the brief when ready (Step 2), noting anything that seems off

**During or after the kickoff call:**
- Upload the transcript (Step 4)
- Begin mailbox warming and domain setup (Step 12) — this is time-sensitive

**Same day as call:**
- Profile synthesizes automatically (Step 5)
- Generate ICP Tree (Step 6), then pause and review it — check the AI's ICP hypotheses against what you heard on the call (ICP Reconciliation)
- Run scoring (Step 7), review the ranked list manually before proceeding
- Plan campaigns for the top ICP(s) (Step 8)

**Next working session:**
- Agree on the offer and success metrics with the client (Steps 9–10)
- Begin list building (Step 11) — this runs in parallel with infrastructure warming

**2–4 weeks later (when mailboxes are warmed):**
- Review copy, create A/B variants, configure sequencer, run test sends, get approval, launch (Step 13)

---

## Feedback Loop (Roadmap)

These capabilities do not exist yet. They are documented here because they represent the next layer of value once the launch process is stable.

**ICP re-ranking after first performance data**  
*Trigger:* 4–6 weeks after launch, or after 200+ emails delivered to a given ICP  
*Who acts:* System flags; AM reviews  
*What happens:* Actual reply rate and positive reply rate are compared to the benchmarks set in Step 10. If an ICP is significantly underperforming, the system surfaces a prompt to re-evaluate its scoring in Step 7 — either updating the rubric inputs or revising the ICP definition. The other ICPs in the tree are re-ranked accordingly.

**Signal-based prospect routing**  
*Trigger:* A monitoring layer detects a trigger event (funding round, leadership hire, job posting matching a buying signal, tech-stack change) for a company that matches a scored ICP  
*Who acts:* System routes; AM optionally reviews before send  
*What happens:* High-signal prospects are elevated to the front of the sequence queue and may receive a variant touch that references the specific trigger. This is the operationalization of the trigger events currently documented in Step 6.

**Sequence branching**  
*Trigger:* Prospect engages (opens, clicks, replies, connects on LinkedIn) or disengages (negative reply, unsubscribe)  
*Who acts:* System routes automatically  
*What happens:* Instead of every prospect following the same 5-touch linear path, engagement data routes prospects to alternative follow-up paths. A prospect who opened three times without replying gets a different Touch 2 than one who never opened. A LinkedIn connection who accepted gets accelerated to a direct email sooner.

**Sequence performance feeding back into copy generation**  
*Trigger:* Statistically significant A/B test results (500+ sends per variant)  
*Who acts:* System surfaces; AM reviews and applies  
*What happens:* Subject line and body variants that outperform their counterparts are flagged. The AI uses this performance data as additional context when generating sequences for future clients with similar ICP profiles.
