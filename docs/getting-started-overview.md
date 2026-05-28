# Getting Started: Client Onboarding Process

## What Is This?

The Getting Started flow is a guided, 8-step onboarding process that takes a brand-new client from zero to a fully planned outbound campaign. It combines AI-powered research, client input, and structured analysis to produce a prioritized outreach plan tailored specifically to that client's business.

Each step builds on the previous one. Some steps can happen at the same time; others must wait for earlier steps to finish first.

> **Current state note:** Steps 1–8 produce a campaign *plan*. Getting that plan into market requires additional work (list building, sender infrastructure, compliance, approval) that is not yet part of the guided flow. See [What's Missing](#whats-missing) below.

---

## The 8 Steps at a Glance

| Step | Name | Who Does It | Unlocks When |
|------|------|-------------|--------------|
| 1 | Run Initial AI Research | System (AI) | Always available |
| 2 | Review Research Brief | Account Manager | Step 1 finishes |
| 3 | Share Client Intake Form | Account Manager | Always available |
| 4 | Upload Onboarding Call Transcript | Account Manager | Always available |
| 5 | Synthesize Company Profile | System (AI) | Step 3 OR Step 4 done |
| 6 | Generate ICP Tree | System (AI) | Step 5 done |
| 7 | Score & Prioritize ICPs | System (AI) | Step 6 done |
| 8 | Plan Email + LinkedIn Campaigns | System (AI) | Step 7 done |

---

## Step-by-Step Breakdown

### Step 1 — Run Initial AI Research
**Who:** The system does this automatically once you enter the client's website domain.  
**What happens:**
1. The system visits the client's homepage and pulls relevant content.
2. It also checks additional pages like Products, Services, About, and Platform for more context.
3. It sends everything to an AI model, which reads all of it and produces a structured research brief covering:
   - What the company does and how it makes money
   - Their key products or services, and what makes them different
   - Their apparent target customers
   - How they position themselves versus competitors
   - Hypotheses about who the ideal customer actually is
   - Suggested outreach angles and hooks
   - A list of things to validate or ask about on the onboarding call
   - How confident the AI is in its findings

**Output:** A structured research brief saved to the client record.  
**Time:** A few minutes. Progress messages appear while it runs ("Fetching homepage...", "Analyzing with Claude...").

> **Gap:** The system only reads the client's public website. It has no access to their CRM data, historical outreach performance, or closed-won deal patterns — which are often the strongest signals for ICP accuracy. If the client has this data, it should be provided via the intake form or uploaded separately before Step 5.

---

### Step 2 — Review Research Brief
**Who:** Account Manager  
**What happens:**
1. You read through the AI-generated brief from Step 1.
2. When satisfied, you click "Mark as Reviewed."

**Why this step exists:** This is a human checkpoint. The AI brief is a starting point — you need to read it before the process moves forward so you're informed going into the client intake and call.

**Output:** The brief is marked reviewed, unlocking nothing downstream on its own (the real unlock chain continues via Steps 3 and 4 running in parallel).

---

### Step 3 — Share Client Intake Form
**Who:** Account Manager  
**What happens:**
1. You click "Copy Intake Link" to get a shareable URL.
2. You send that link to the client.
3. The client fills out the form independently. It covers five sections:
   - **About Their Business** — core problem they solve, current customers, proof points, competitors, deal size, typical sales cycle
   - **Products/Services** — for each product: what it does, what pain it solves, the value it delivers, and pricing structure
   - **Target Customers** — ideal industries, company sizes, buyer titles, what triggers a purchase, and the cost of doing nothing
   - **Messaging Preferences** — tone, what's worked in past outreach, what to avoid, 90-day goal, whether the website can be referenced
   - **Optional Materials** — example emails or any other reference content they want to share
4. When the client submits the form, it's automatically saved to their record with a timestamp.

**Note:** This can happen at the same time as Steps 1, 2, and 4. You don't need to wait for the research brief before sending the intake form.

> **Gap:** The intake form asks "what's worked in past outreach" as a free-text field. A much stronger input would be actual past sequences with their reply rates or positive reply rates. If the client has this data, ask them to include it in the Optional Materials section or paste it into the Notes field. The AI in Step 8 will produce better copy if it has concrete performance data to learn from rather than a general description.

> **Gap:** The form does not ask about the specific ask the client wants to make in outreach — the offer, the call-to-action (e.g., "15-minute intro call," "free audit," "demo," "teardown"). The offer is often more important than the copy in cold outreach. This should be captured here and used in Step 8 to anchor every touch's CTA.

---

### Step 4 — Upload Onboarding Call Transcript
**Who:** Account Manager  
**What happens:**
1. After the onboarding or kickoff call with the client, you upload the transcript.
2. The system recognizes it as an onboarding/kickoff call and marks this step complete.

**Note:** This can happen at the same time as Steps 1, 2, and 3.

---

### Step 5 — Synthesize Company Profile
**Who:** The system does this, triggered once Step 3 or Step 4 is complete (whichever comes first).  
**What happens:**
The AI combines everything collected so far — the intake form, the call transcript, and the research brief — and builds a unified company profile. This includes:
- Company name, pitch, and product summary
- Full product/service catalog
- Target personas
- Value propositions
- Proof points and messaging tone preferences

**Output:** A complete, structured company profile that all remaining steps draw from.

---

### Step 6 — Generate ICP Tree
**Who:** The system does this once Step 5 is complete.  
**What happens:**
The AI takes the company profile and builds a hierarchical "ICP Tree" — a structured map of the client's Ideal Customer Profiles. Each ICP branch includes:
- The type of company that's the best fit
- The specific personas (job titles/roles) within those companies
- The jobs those personas are trying to get done
- Events or situations that trigger a buying decision
- Suggested outreach plays for each scenario

**Output:** A structured ICP tree that feeds directly into scoring.

> **Gap:** The trigger events in the ICP tree (funding rounds, hiring spikes, leadership changes, tech-stack changes, etc.) are documented but not operationalized. Nothing in the current flow connects these triggers to a live monitoring or signal layer — so the campaigns built in Step 8 are static rather than signal-driven. This is a significant gap for modern cold outreach, where timeliness and relevance to a real-world event are major drivers of reply rate.

---

### Step 7 — Score & Prioritize ICPs
**Who:** The system does this once Step 6 is complete.  
**What happens:**
The AI evaluates each ICP from the tree across five weighted dimensions:

| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| Product-Market Fit | 25% | How well the product solves a real, urgent pain for this ICP |
| Market Size & Accessibility | 20% | How large and reachable this market is |
| Proof Availability | 20% | How much existing evidence (case studies, logos, results) supports this ICP |
| Outreach Accessibility | 20% | How easy it is to find and contact decision-makers in this segment |
| Competitive Advantage | 15% | How strong the client's differentiation is in this space |

Each ICP gets:
- A score on each dimension (0–10)
- A weighted overall score
- A recommendation: **Launch First**, **Launch Second**, **Test Small**, **Defer**, or **Skip**
- A summary of top strengths, gaps, and the best outreach angle

**Output:** A ranked list of ICPs with actionable prioritization guidance.

> **Gap:** All scoring is done by the AI based solely on the synthesized text. There is no human approval gate before campaigns are written. If the AI mis-scores an ICP — for example, because the client forgot to mention three relevant case studies in the intake form — campaigns get written against the wrong ICP first, and you only discover the error later. A lightweight human review of the ranked ICPs before Step 8 begins would catch this.

> **Gap:** The rubric does not account for **sales cycle length** or **willingness/ability to pay**. An ICP can score well on all five dimensions but have a 9-month sales cycle, making it a poor choice for "Launch First" if the client needs revenue this quarter. These factors should either be added as dimensions or surfaced as caveats alongside each ICP's recommendation.

---

### Step 8 — Plan Email + LinkedIn Campaigns
**Who:** The system does this once Step 7 is complete, for whichever ICP(s) you select.  
**What happens:**
For each selected ICP, the AI generates a full 5-touch outbound sequence across both email and LinkedIn.

**Email Sequence:**
| Touch | Timing | Focus |
|-------|--------|-------|
| 1 | Day 0 | Hook — lead with numbers or offer free value upfront |
| 2 | Day 3 | Proof — social proof or customer story |
| 3 | Day 7 | Reframe — challenge a common misconception or take a contrarian angle |
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

For every single touch, across both channels, the AI writes:
- The full message body
- A subject line (for email)
- Which GTM strategy (go-to-market angle) is being used and why
- Which persona/role it's targeting

**Output:** A complete, ready-to-use campaign plan saved to the client's account.

> **Gap:** The sequence is linear — every prospect goes through the same 5 touches in the same order regardless of how they respond. There is no branching logic: if someone opens the email but doesn't reply, the sequence doesn't adapt; if someone responds negatively, there's no alternative path; if someone engages on LinkedIn, it doesn't accelerate the email cadence. Real-world sequences need at least basic branching rules.

> **Gap:** Only one version of each touch is generated. For any serious outbound program, at least two variants per touch should be created from the start so that A/B testing can begin on day one. Waiting to create variants later means weeks of performance data collected on a single version before you can start learning.

> **Gap:** The channel mix is email + LinkedIn only. For high-ACV ICPs (enterprise deals, $50k–$100k+), a 5-email/5-LinkedIn sequence is typically undermatched. Phone, warm introductions, direct mail, and paid retargeting are all valid supplements that the current plan does not account for.

---

## What Can Happen in Parallel

```
Step 1 (AI Research)   ─────────────────── Step 2 (Review Brief)
                                                      │
Step 3 (Intake Form)  ─────────────────── Client Submits ─────┐
                                                               │
Step 4 (Upload Transcript) ───────────────────────────────────┤
                                                               │
                                                         Step 5 (Synthesize Profile)
                                                               │
                                                         Step 6 (Generate ICP Tree)
                                                               │
                                                         Step 7 (Score ICPs)
                                         [Human review recommended here]
                                                               │
                                                         Step 8 (Plan Campaigns)
```

**Steps 1–4 are mostly independent.** You can:
- Send the intake form (Step 3) before the research is done (Step 1/2)
- Upload the transcript (Step 4) before the intake form comes back (Step 3)
- Run Steps 1, 3, and 4 all at the same time

**Steps 5–8 are strictly sequential.** Each one needs the previous one to finish:
- You can't synthesize the profile (5) until you have at least the intake form or transcript
- You can't generate the ICP tree (6) until the profile exists
- You can't score (7) until the tree exists
- You can't plan campaigns (8) until scoring is done

---

## Practical Workflow Recommendation

The fastest path through onboarding:

1. **Day 1 (Kickoff Prep):**
   - Run AI Research (Step 1) — takes a few minutes, do it first
   - While it runs, send the intake form to the client (Step 3)
   - Review the brief when it's ready (Step 2)

2. **After Kickoff Call:**
   - Upload the transcript (Step 4)
   - The system will automatically synthesize the profile (Step 5) and begin the analysis chain

3. **Within Minutes of Profile Completion:**
   - Generate ICP Tree (Step 6) — click to trigger
   - Score ICPs (Step 7) — click to trigger
   - **Review the ranked ICPs manually before proceeding** — check that the scoring matches your understanding from the call and intake form
   - Select top ICP(s) and plan campaigns (Step 8)

In a typical scenario, the entire process from Step 5 through Step 8 can complete in under 10 minutes once the input data is in.

---

## What's Missing {#whats-missing}

Steps 1–8 produce a campaign **plan**. A plan is not a campaign in market. The following pieces are required before a single email sends, and none of them are currently part of the guided flow.

### Step 9 — Define Success Metrics & Offer

Before any outreach goes out, two things need to be locked:

1. **The offer / CTA.** What specific action does every touch ask the prospect to take? (15-minute call, free audit, demo, teardown, report, etc.) The ICP scoring generates a "best outreach angle" but doesn't force a commitment to a specific ask. Without a defined offer, the AI-written sequences may hedge or vary the ask across touches, which hurts conversion.

2. **Success benchmarks.** What reply rate, positive reply rate, and meeting-booked rate should this ICP and offer combination hit? Without a baseline expectation going in, there's no way to know whether week-2 performance means the ICP hypothesis is wrong or just that the sequence needs tuning.

These should be decided collaboratively with the client before list building begins.

---

### Step 10 — Build Lead Lists

The campaigns in Step 8 are written for specific personas within specific ICP segments. Those sequences have no leads to run against until lists are built. This involves:

- Identifying which tools will be used for prospecting (Apollo, Clay, LinkedIn Sales Nav, ZoomInfo, etc.)
- Filtering by the ICP criteria from Step 7: industry, company size, tech stack, geography, growth signals
- Enriching records with verified email addresses and LinkedIn URLs
- Applying suppression lists (existing customers, competitors, contacts already in CRM, previous bounces, unsubscribes)
- Estimating list size to validate whether the market is big enough to sustain the campaign

This step can be parallelized with Step 11 once the ICP criteria are confirmed.

---

### Step 11 — Set Up Sender Infrastructure

Cold email deliverability is infrastructure, not copy. A campaign with perfect sequences and no warmed-up sending infrastructure will land in spam from day one. This step covers:

- **Domain setup.** Secondary sending domains purchased and configured (SPF, DKIM, DMARC records set correctly)
- **Mailbox warming.** New mailboxes need 2–4 weeks of warm-up activity before cold volume begins
- **Sending limits.** Per-mailbox daily send limits defined and enforced (typically 30–50 emails/mailbox/day for new domains)
- **LinkedIn account health.** Connection request rates kept within safe limits; accounts not flagged or restricted
- **Unsubscribe handling.** One-click unsubscribe in all emails; mechanism to suppress unsubscribers from future sends
- **Compliance check.** CAN-SPAM, GDPR, and CASL requirements confirmed based on where prospects are located

This takes 2–4 weeks if starting from scratch. It should begin as soon as the ICP is selected in Step 7, not after campaigns are written.

---

### Step 12 — Review, Approve & Launch

A final human gate before anything sends:

- **Copy review.** Account manager and client review all touches across both channels; edits made as needed
- **A/B variants created.** At minimum, two subject line variants and two body variants per touch so testing can begin on day one
- **Sequencer configured.** Sequences loaded into the sending tool (Instantly, Smartlead, HubSpot Sequences, Outreach, etc.) with correct timing, personalization variables, and branching rules
- **Test sends.** Sample emails sent to internal addresses and checked in Gmail, Outlook, and on mobile for rendering, deliverability, and link tracking
- **Launch approved.** Client signs off before volume begins

---

## The Feedback Loop (What Doesn't Exist Yet)

Once a campaign is live, the current flow has no mechanism to bring learnings back into the system. What's needed:

- **Reply data feeding ICP scores.** If an ICP that scored "Launch First" gets a 0.4% positive reply rate after 500 sends, that should automatically flag the score as potentially wrong and surface a re-evaluation prompt.
- **Signal-based routing.** The trigger events identified in Step 6 (funding rounds, hiring spikes, leadership changes) should eventually feed a live signal layer that routes high-signal prospects to the top of the sequence queue.
- **Sequence branching.** Prospects who open but don't reply, reply negatively, or engage on LinkedIn should be routed to different follow-up paths rather than continuing the same linear 5-touch sequence.
- **ICP re-ranking.** After 4–6 weeks of real performance data, the ICP tree should be revisited and re-ranked based on actual results, not just AI inference from text.

---

## Summary: Where the Flow Stands Today

| Area | Status |
|------|--------|
| Company research | ✅ Automated |
| Client intake collection | ✅ Automated |
| Profile synthesis | ✅ Automated |
| ICP mapping | ✅ Automated |
| ICP scoring | ✅ Automated (AI-only, no human gate) |
| Campaign copy generation | ✅ Automated |
| Offer / CTA definition | ❌ Not in flow |
| Success metric definition | ❌ Not in flow |
| Lead list building | ❌ Not in flow |
| Sender infrastructure | ❌ Not in flow |
| Compliance check | ❌ Not in flow |
| A/B variant generation | ❌ Not in flow |
| Human approval gate | ❌ Not in flow |
| Signal/trigger operationalization | ❌ Not in flow |
| Reply data feedback loop | ❌ Not in flow |
| Sequence branching logic | ❌ Not in flow |
