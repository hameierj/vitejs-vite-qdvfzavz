# Getting Started: Client Onboarding Process

## What Is This?

The Getting Started flow is a guided, 8-step onboarding process that takes a brand-new client from zero to a fully planned outbound campaign. It combines AI-powered research, client input, and structured analysis to produce a prioritized outreach plan tailored specifically to that client's business.

Each step builds on the previous one. Some steps can happen at the same time; others must wait for earlier steps to finish first.

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
   - Select top ICP(s) and plan campaigns (Step 8)

In a typical scenario, the entire process from Step 5 through Step 8 can complete in under 10 minutes once the input data is in.
