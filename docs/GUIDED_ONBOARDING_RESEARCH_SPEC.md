# Guided Onboarding — Research Reproduction Spec

A complete, self-contained reference for **recreating the AI research** that the
gated guided onboarding (Flow 1) performs. Everything you need to reproduce a
stage outside the app is here: the model, the system prompt, the exact user
prompt (with all template variables), the request body, and the output JSON
schema.

The onboarding is two parallel tracks:

- **Track A — Research sequence** (gated, runs in order, each gate unlocks the next):
  1. Company Research → 2. Products & Services → 3. TAM Tree → ICPs →
  4. Personas → 5. Outreach Campaigns
- **Track B — Infrastructure** (runs in parallel from intake; no dependency on Track A)

Each Track-A stage runs server-side as a Supabase edge function under
`EdgeRuntime.waitUntil`. The function responds immediately with `{ jobId }`,
then writes progress + the final result to `app_data[<stage>_job_<workspaceId>]`.
The client polls that row, merges the result into the workspace, and persists it.

| Stage | Edge function | Model | Job row key |
|-------|--------------|-------|-------------|
| 1. Company Research | `gs-research-run` | `claude-sonnet-4-6` | `gs_research_job_<wsId>` |
| 2. Products & Services | `products-run` | `claude-sonnet-4-6` (streaming) | `products_job_<wsId>` |
| 3. TAM Tree → ICPs | `tam-icp-run` | `claude-sonnet-4-6` | `tamicp_job_<wsId>` |
| 4. Personas | `personas-run` | `claude-sonnet-4-6` | `personas_job_<wsId>` |
| 5. Outreach Campaigns | client-side (`App.tsx`) | via `ai-proxy` | (n/a — writes campaigns) |
| B. Infra (domains/mailboxes) | `infra-run` | `claude-haiku-4-5-20251001` | `infra_job_<wsId>` |
| (post-onboarding) Deep ICP tree | `icp-tree-expand` | haiku + sonnet | `icptree_job_<wsId>` |

**Common Anthropic call shape** (all stages):
```
POST https://api.anthropic.com/v1/messages
headers: { "Content-Type": "application/json", "x-api-key": <ANTHROPIC_API_KEY>, "anthropic-version": "2023-06-01" }
body: { model, max_tokens, system, messages: [{ role: "user", content }] }
```
The output is read from `json.content[0].text` and parsed as JSON (models are
told to return JSON only; a regex fallback extracts the outermost `{...}` or
fenced block if the model adds prose).

---

## How user context flows into every stage

The user can steer research in two places. Both become an authoritative
`userContext` string injected into the prompt.

**Stage 1 (structured context).** Three optional fields + uploaded documents,
assembled client-side (`App.tsx` `handleStartResearch`):

```js
const ctxParts = [];
if (rc.products) ctxParts.push(`PRODUCTS & SERVICES (user-provided — text and/or links):\n${rc.products}`);
if (rc.company)  ctxParts.push(`ABOUT THE COMPANY (user-provided — text and/or links):\n${rc.company}`);
if (rc.other)    ctxParts.push(`SPECIAL INSTRUCTIONS (user-provided):\n${rc.other}`);
// docx/txt/csv/json files are text-extracted and appended as: `DOCUMENT "<name>":\n<text…8000 chars>`
const userContext = ctxParts.join("\n\n");
// PDFs + images are NOT text-extracted — they are sent as native Claude content blocks (see Stage 1).
```

**Stages 2–4 (per-gate guidance note).** Each gate has a free-text "Add context
for the AI" box stored at `companyData._gateNotes[<stage>]`. On generation it is
passed verbatim as `userContext`:

```js
const userContext = (companyData._gateNotes || {})[stage] || "";
```

In every prompt, `userContext` is treated as **authoritative ground truth** that
**overrides the website** when they conflict, and **constrains scope** (e.g. if
the user says "they only sell X", the output must contain only X).

---

# STAGE 1 — Company Research (`gs-research-run`)

Fetches the homepage + key sub-pages, sends the text (plus any attached PDFs/
images as native content blocks) to Claude, and produces a structured
pre-onboarding research brief.

### Request body
```json
{
  "workspaceId": "string (required)",
  "domain": "company.com (required)",
  "userContext": "string (optional — see above)",
  "documents": [
    { "name": "deck.pdf", "mediaType": "application/pdf", "base64": "..." },
    { "name": "logo.png", "mediaType": "image/png", "base64": "..." }
  ]
}
```

### Page fetching
Pages are fetched through the Jina reader proxy `https://r.jina.ai/<url>`:
- Homepage: `<url>`, 20s timeout, first 12,000 chars
- Sub-pages (concurrent, first usable wins, >500 chars): `/products`, `/services`,
  `/solutions`, `/about`, `/platform` — 10s timeout, 6,000 chars each
- The best sub-page is appended as `\n\n<PATH> PAGE:\n<content>`

### Document content blocks
PDFs → `{ "type": "document", "source": { "type": "base64", "media_type": "application/pdf", "data": <b64> }, "title": <name> }`
Images → `{ "type": "image", "source": { "type": "base64", "media_type": <mime>, "data": <b64> } }`
When docs are attached, the user `content` is an array: `[{ "type": "text", "text": <prompt> }, ...blocks]`. Otherwise it is the plain prompt string.

### Model / params
- `model: "claude-sonnet-4-6"`, `max_tokens: 4000`, 120s timeout
- **System prompt:** `You are a senior B2B go-to-market researcher. Return only valid JSON.`

### User prompt (verbatim template)
Variables: `${domain}`, `${userContext}`, `${blocks.length}` (doc count),
`${pageContent}`, `${normUrl}`, `${new Date().toISOString()}`.

```
Produce a comprehensive pre-onboarding research brief for a B2B outreach team about ${domain}.
${userContext ? `
═══════════════════════════════════════════════
USER-PROVIDED CONTEXT — AUTHORITATIVE. THIS IS THE GROUND TRUTH.
═══════════════════════════════════════════════
${userContext}

RULES FOR USING THIS CONTEXT (these override everything else):
- The user knows this business better than the website does. When the website and this context disagree, the user is RIGHT — follow the user.
- This context CONSTRAINS the brief, it doesn't just "inform" it. If the user states what the company sells (e.g. "they mainly sell X and sometimes Y, that's it"), then "productsServices" must contain ONLY those items. Do NOT add other products, services, or business lines from the website — even if the website prominently features them. Treat anything the user excluded as out of scope.
- Use the website (and any attached documents) ONLY to enrich and add detail to what the user described — never to expand the scope beyond it.
═══════════════════════════════════════════════
` : ""}${blocks.length ? `\nThe user also attached ${blocks.length} document${blocks.length > 1 ? "s" : ""} (decks/PDFs/one-pagers) below. Treat them as authoritative primary sources, second only to the user-provided context above.\n` : ""}
WEBSITE CONTENT${userContext ? " (use for enrichment only — do not let it override the user context above)" : ""}:
${pageContent || "(no content fetched — use domain knowledge about " + domain + ")"}

DOMAIN: ${domain}

Return a JSON object:
{
  "generatedAt": "${new Date().toISOString()}",
  "domain": "${domain}",
  "sources": ["${normUrl}"],
  "companyOverview": {
    "name": "company name",
    "size": "estimated employee count or range",
    "stage": "startup/growth/established/enterprise",
    "businessModel": "B2B SaaS / agency / services / marketplace / etc."
  },
  "productsServices": [
    { "name": "product name", "description": "what it does in 1-2 sentences", "targetBuyer": "who buys this", "differentiator": "what makes it different" }
  ],   // If the user-provided context scopes what they sell, this list must contain ONLY those items — nothing else from the website.
  "valuePropositions": [
    { "claim": "specific value claim", "evidence": "supporting evidence if any", "quantified": true/false }
  ],
  "targetMarketEvidence": {
    "industries": ["industry1", "industry2"],
    "companySizes": ["size range"],
    "knownCustomers": ["customer1 if mentioned"]
  },
  "competitivePositioning": {
    "category": "market category",
    "mainCompetitors": ["competitor1"],
    "differentiators": ["differentiator1", "differentiator2"]
  },
  "icpHypotheses": [
    { "name": "ICP name e.g. 'Mid-Market SaaS — VP Sales'", "rationale": "why this is likely an ICP", "confidence": "high/medium/low", "signals": ["signal1", "signal2"] }
  ],
  "recommendedAngles": [
    { "angle": "outbound angle name", "why": "why this angle works for this company", "bestChannel": "email/linkedin", "suggestedHook": "a concrete hook sentence to test" }
  ],
  "callPrepNotes": "A bulleted list of 5-8 things the CSM should confirm, ask, or validate during the onboarding call. Focus on gaps in the research and hypotheses that need validation.",
  "confidenceNotes": "1 sentence about the quality/completeness of the research — what was unclear or missing"
}

Return only valid JSON. Be specific and concrete — no vague marketing language.
```

### Output
The parsed brief is written to `app_data[gs_research_job_<wsId>].result`. The
client merges it into `companyData._initialResearchBrief`. **This brief is the
input ground truth for stages 2–4** (each reads the research job row directly).

---

# STAGE 2 — Products & Services (`products-run`)

Expands each product/service from the confirmed research brief into a full
profile (40 fields). Generated **one product at a time** (sequential — parallel
calls throttled each other into thin results).

### Request body
```json
{
  "workspaceId": "string (required)",
  "userContext": "string (optional)",
  "seeds": [
    { "name": "...", "description": "...", "targetBuyer": "...", "differentiator": "..." }
  ]
}
```
**Seed precedence:** user-curated `seeds` (from the Step-2 editable checklist) →
else `brief.productsServices` → else `{ name: co_product, description: … }` →
else `{ name: co_name || "Core Offering" }`. Capped at **8** seeds.

### Model / params
- `model: "claude-sonnet-4-6"`, `max_tokens: 3500`, **streaming** (`stream: true`)
- Streaming is used because a full profile can exceed 2 min; aborts only on 40s
  of inactivity. Retries 429/529/5xx with backoff. Overall pipeline deadline 350s,
  per-product slice ~150s, up to 3 attempts per product (retry if <6 fields filled).
- **System prompt:** `Return only valid JSON. Be specific and actionable.`

### Company context block (built from the brief, prepended to each product prompt)
```
COMPANY (from the confirmed company research — ground every field in this; do NOT genericize):
Name: <name> · Size: <size> · Stage: <stage>
Business model: <businessModel>
Category: <category>
Main competitors: <mainCompetitors joined>
Key differentiators: <differentiators joined>
Value propositions (with any supporting evidence):
- <claim> (<evidence>)
Known customers (the ONLY customers you may cite as proof): <knownCustomers>
Target buyers / ICP hypotheses:
- <icp name>: <rationale>
```

### Naming rules constant (`PRODUCT_NAMING`)
```
PRODUCT NAMING RULES (strict):
- USE THE EXACT PRODUCT NAME as it appears on the company's website. Do NOT rename or genericize.
- Only simplify when the company uses excessive marketing fluff.
- Keep under 40 characters. Preserve the company's branding.
```

### User prompt (verbatim template, per product)
Variables: `${companyName}`, `${PRODUCT_NAMING}`, `${briefContext}` (block above),
`${p.name}`, `${p.description}`, `${p.targetBuyer}`, `${p.differentiator}`, `${userContext}`.

```
Create a product profile for a SPECIFIC company's product. Stay true to ${companyName}'s actual business; do NOT produce generic SaaS boilerplate.
KEEP EVERY FILLED FIELD CONCISE: 1-2 sentences (or a short comma/newline list) per field — specific, not padded.

${PRODUCT_NAMING}

${briefContext}

THIS PRODUCT (expand into a profile — keep it specific to ${companyName}):
Name: ${p.name}
Description: ${p.description || ""}
Target buyer: ${p.targetBuyer || ""}
Differentiator: ${p.differentiator || ""}
${userContext ? `\nUSER-PROVIDED CONTEXT (authoritative — weight this heavily, it overrides the website):\n${userContext}\n` : ""}
HOW TO FILL FIELDS — read carefully:
1. REASONING FIELDS — fill these from the company research, context, and sound B2B reasoning: description, category, useCases, keyFeatures, problemsSolved, valueProposition, timeToValue, idealCustomer, marketMaturity, competitors, buyerObjections, switchTriggers, unsolvedImpact, elevatorPitch, positioningStatement, messagingDos, messagingDonts, dealType. Reuse ${companyName}'s real category, competitors, differentiators, and value props above — don't invent generic ones.
2. EVIDENCE & COMMERCIAL FIELDS — DO NOT FABRICATE. These must be grounded in actual facts from the research/website/user context: proofPoints, roiMetrics, caseStudies, industryProof, socialProof, acv, mrr, contractLength, renewalRate, expansionRevenue, ltv, avgDealSize, repeatRate, referralRate, avgDaysToClose, closeRateByStage, dealStakeholders, discountAuthority, paymentTerms. NEVER invent customer names, metrics, ROI figures, pricing, contract values, or case studies. If a value is not explicitly supported by the provided sources, return an EMPTY STRING "" for that field. A blank field is correct and expected — the user will fill it. Do not guess.
3. objectionRebuttals: you may write rebuttals, but they must NOT cite invented proof, numbers, or customers — keep them logic-based unless real proof exists above.

Return ONLY JSON (use "" for any evidence/commercial field you cannot ground in real facts):
{"name":"","description":"","category":"Software|Platform|Service|Hardware|Consulting|Other","useCases":"","keyFeatures":"","problemsSolved":"","valueProposition":"","timeToValue":"","idealCustomer":"","marketMaturity":"Established category — buyers know what this is|Emerging category — some education needed|New category — significant education required|Replacing an existing behavior (not a tool)","competitors":"","buyerObjections":"","switchTriggers":"","dealType":"Recurring (subscription / retainer)|One-Time (project / purchase)|Both — recurring and one-time options","acv":"","mrr":"","contractLength":"Month-to-month|Quarterly|6 months|Annual|Multi-year|Custom","renewalRate":"","expansionRevenue":"","ltv":"","avgDealSize":"","repeatRate":"","referralRate":"","avgDaysToClose":"","closeRateByStage":"","dealStakeholders":"","discountAuthority":"","paymentTerms":"","proofPoints":"","roiMetrics":"","caseStudies":"","industryProof":"","socialProof":"","objectionRebuttals":"","unsolvedImpact":"","elevatorPitch":"","positioningStatement":"","messagingDos":"","messagingDonts":""}

unsolvedImpact: what happens if the customer does nothing — lost revenue, competitive disadvantage, scaling limits (reasoning is fine here).
dealType: infer whether recurring (SaaS, subscription, retainer) or one-time (project, purchase) — this is a reasoning field, fill it. But the underlying commercial NUMBERS (acv, mrr, avgDealSize, etc.) stay BLANK unless the sources actually state them.
```

### Full product field list (`PRODUCT_FIELD_IDS`)
Each profile object is initialized with these 40 keys (all `""`), plus
`id`, `sourceUrl`, `createdAt`:
```
name, description, category, useCases, keyFeatures, problemsSolved, valueProposition,
timeToValue, idealCustomer, marketMaturity, competitors, buyerObjections, switchTriggers,
dealType, acv, mrr, contractLength, renewalRate, expansionRevenue, ltv, avgDealSize,
repeatRate, referralRate, avgDaysToClose, closeRateByStage, dealStakeholders,
discountAuthority, paymentTerms, proofPoints, roiMetrics, caseStudies, industryProof,
socialProof, objectionRebuttals, unsolvedImpact, elevatorPitch, positioningStatement,
messagingDos, messagingDonts, prod_notes
```

### Output
`app_data[products_job_<wsId>].result = { products: [...] }`. Client merges into
the `products[]` array.

---

# STAGE 3 — TAM Tree → ICPs (`tam-icp-run`)

Builds a company-level TAM + per-product TAM, identifies ICPs per branch (flagged
unique vs cross-product), explains them, and scores each on a 5-dimension rubric.

### Request body
```json
{ "workspaceId": "string (required)", "userContext": "string (optional)" }
```
Reads the confirmed research brief (job row → `_initialResearchBrief` fallback)
and the confirmed `products[]`.

### Scoring rubric (`DIMENSIONS`) — also the client `ICPScoringMatrix` weights
```
market_size  "Market Size & Accessibility"  weight 0.20
pmf          "Product-Market Fit"           weight 0.25
proof        "Proof Availability"           weight 0.20
outreach     "Outreach Accessibility"       weight 0.20
advantage    "Competitive Advantage"        weight 0.15
```
Weighted score = Σ(score × weight), each dimension scored 1–10. ICPs ranked desc.

### Model / params
- `model: "claude-sonnet-4-6"`, `max_tokens: 8000`, 150s timeout
- **System prompt:** `You are a senior B2B go-to-market strategist. Return only valid JSON.`

### Company context block (`briefContext`)
```
COMPANY (from the confirmed Step-1 research — this is the authoritative source; ground the TAM and ICPs in it):
Name: <name> · Size: <size> · Stage: <stage> · Model: <businessModel>
Category / industry: <category>
Value propositions:
- <claim> (evidence: <evidence>)
Key differentiators: <differentiators>
Main competitors: <competitors>
Known customers (real — use for the proof dimension): <knownCustomers>
Industries with market evidence: <industries>
ICP HYPOTHESES from research (use as starting candidates — validate/refine/merge, don't blindly copy):
- <name>: <rationale> [signals: <signals>]
```
`productLines` = numbered list `i. <name> — <description> (ideal customer: <idealCustomer>)`.

### User prompt (verbatim template)
```
Build a TAM (Total Addressable Market) tree for this company and identify the Ideal Customer Profiles (ICPs) for outbound, branching by product/service.

${briefContext}

PRODUCTS / SERVICES (branch the tree per product):
${productLines}
${userContext ? `\nUSER-PROVIDED CONTEXT (authoritative — weight this heavily, it overrides the research when they conflict):\n${userContext}\n` : ""}
INSTRUCTIONS:
1. Company-level TAM: summarize the overall addressable market and break it into 2-4 broad market segments. For each segment's "sizeEstimate", give a ROUGH DIRECTIONAL estimate only (prefix with "~", ranges are fine, e.g. "~$2-4B") — this is a ballpark, not a researched figure; never present it as precise.
2. Per-product TAM: for EACH product/service above, summarize its addressable market and identify 1-3 ICPs that would buy it.
3. Flag each ICP's scope: "unique" (specific to one product) or "cross_product" (a buyer that fits multiple products — note which).
4. For EACH ICP, score the 5 dimensions 1-10 with a one-line rationale:
   - market_size (Market Size & Accessibility)
   - pmf (Product-Market Fit)
   - proof (Proof Availability — do we have evidence/case studies for them) — score this HONESTLY against the known customers / proof above; if there's no real proof for a buyer, score it LOW. Do not assume proof exists.
   - outreach (Outreach Accessibility — can we reach them by email/LinkedIn)
   - advantage (Competitive Advantage vs incumbents for this buyer)
5. Give each ICP: a 1-2 sentence explanation of WHY it's an ICP, top 2 strengths, top 2 gaps, a one-sentence suggested outbound angle, and a recommendation: "launch_first"|"launch_second"|"test_small"|"defer"|"skip".

Use a SHORT ICP name format: "[Industry/Vertical] — [Buyer Role]" (e.g. "Mid-Market SaaS — VP Sales"). Identify 3-8 distinct ICPs total across all branches; merge true duplicates into one cross_product ICP.

Return ONLY valid JSON:
{
  "companyLevel": { "tamSummary": "", "segments": [{ "name": "", "sizeEstimate": "", "rationale": "" }] },
  "perProduct": [
    { "productIndex": 0, "productName": "", "tamSummary": "",
      "icps": [
        { "name": "", "scope": "unique|cross_product", "alsoFitsProducts": ["product name"],
          "explanation": "", "industries": "", "buyerTitles": "", "primaryPain": "",
          "dimensions": { "market_size": {"score":0,"rationale":""}, "pmf": {"score":0,"rationale":""}, "proof": {"score":0,"rationale":""}, "outreach": {"score":0,"rationale":""}, "advantage": {"score":0,"rationale":""} },
          "topStrengths": ["",""], "topGaps": ["",""], "suggestedAngle": "", "recommendation": "launch_first" }
      ] }
  ]
}
Raw JSON only. Be specific and concrete — no vague marketing language.
```

### Post-processing → output
The raw tree is flattened into three artifacts (cross-product ICPs deduped by
lowercased name; each ICP gets a color, draft approval state, and links to its
product):
```json
{
  "tamTree":  { "companyLevel": {...}, "perProduct": [...] },   // → companyData._tamTree
  "icps":     [ { "id","color","name","data":{industries,buyer,pain1,_tamScope,_tamExplanation}, "linkedProductIds":[...], ... } ],  // → icps[]
  "scoring":  { "generatedAt", "rubric": DIMENSIONS, "icps": [ { "icpId","icpName","dimensions":[{key,label,weight,score,rationale}],"weightedScore","rank","recommendation","topStrengths","topGaps","suggestedAngle","scope" } ] }  // → companyData._icpScoringResult
}
```

---

# STAGE 4 — Personas (`personas-run`)

Enriches the user-selected (or top-scoring) ICPs into **complete B2B outreach
personas**. Runs the selected ICPs **in parallel** (`Promise.all`).

### Request body
```json
{
  "workspaceId": "string (required)",
  "userContext": "string (optional)",
  "icpIds": ["icp-id-1", "icp-id-2"]
}
```
**Selection:** explicit `icpIds` (Step-4 picker, capped at `MAX_SELECTABLE = 8`,
ordered by weighted score) → else default top `MAX_PERSONAS = 6` by score.

### Model / params
- `model: "claude-sonnet-4-6"`, `max_tokens: 6000` (attempt 1) / `8000` (attempt 2, on `max_tokens` stop), 150s timeout
- **System prompt:** `Return only valid JSON. Be specific and actionable.`
- Grounding facts pulled from the brief: real competitors, real known customers.

### Naming rules constant (`PERSONA_NAMING`)
```
PERSONA NAMING RULES (strict):
- Format: "[Industry/Vertical] — [Buyer Role]"
- Keep under 40 characters. No marketing fluff, no full sentences.
```

### User prompt (verbatim template, per persona)
Variables include `${cd.co_name}`, `${realCompetitors}`, `${realCustomers}`,
`${icp.name}`, `${icp.data.buyer}`, `${icp.data.industries}`, `${icp.data.pain1}`,
`${icp.data._tamExplanation}`, `${userContext}`, `${dedup}` (one-line summary of
all personas being built, so each comes out distinct).

```
Draft a B2B persona for cold outreach.

${PERSONA_NAMING}

Company: ${cd.co_name || cbrief.companyOverview?.name || ""} (${cd.co_industry || cpos.category || ""})
Value Prop: ${cd.co_pitch || ""}
Real competitors (the ONLY competitors you may name): ${realCompetitors || "(none known — leave competitor names out)"}
Real known customers (the ONLY customers you may cite): ${realCustomers || "(none known — do NOT invent customer names)"}
Persona: ${icp.name} — ${icp.data?.buyer || ""}
Industries: ${icp.data?.industries || ""}
Primary pain: ${icp.data?.pain1 || ""}
Why this is an ICP: ${icp.data?._tamExplanation || ""}
${userContext ? `\nUSER-PROVIDED CONTEXT (authoritative — weight this heavily, it overrides everything else):\n${userContext}\n` : ""}
ALL PERSONAS being created (ensure yours is DISTINCT — different industries, titles, pains, messaging):
${dedup}

HOW TO FILL FIELDS — read carefully:
1. REASONING FIELDS — fill these from the research, context, and sound B2B reasoning: buyer, champ, goals, fears, metrics, objections, sub_personas, pain1, pain2, gains, triggers, sq_cost, friction_points, buying_signals_direct, buying_signals_indirect, hook, tone, cta, why_client_wins, seq_strategy, seq_cta_style, incumbent_strengths, switching_triggers, displacement_messaging, best_channel, best_time, linkedin_activity, phone_accessibility, email_preference, interested_criteria, warm_criteria, meeting_ready_criteria, not_now_criteria, dead_criteria, industries, co_sizes.
2. DO-NOT-FABRICATE FIELDS — leave these as an EMPTY STRING "" unless the value is explicitly supported by the research/context above: geo, revenue, tech, keywords, dream_accts, real_filters, intent_topics, current_solutions, win_loss_patterns, icp_proof. NEVER invent specific company names, tool/vendor names, exact targeting filters, revenue/geo specifics, or deal-history figures. A blank field is correct — the user fills these. For icp_proof, only reference the real known customers above; if none, leave "".

Return ONLY JSON (use "" for any do-not-fabricate field you cannot ground in real facts):
{"name":"","fields":{"industries":"","co_sizes":["SMB 1–50","Mid-Market 51–500","Enterprise 500+"],"geo":"","revenue":"","tech":"","keywords":"","dream_accts":"","neg":"","intent_topics":"","real_filters":"","buyer":"","champ":"","goals":"","fears":"","metrics":"","objections":"","sub_personas":"","pain1":"","pain2":"","gains":"","triggers":"","buying_signals_direct":"","buying_signals_indirect":"","sq_cost":"","friction_points":"","tone":"","hook":"","cta":"","why_client_wins":"","icp_proof":"","seq_strategy":"","seq_cta_style":"","current_solutions":"","incumbent_strengths":"","switching_triggers":"","displacement_messaging":"","win_loss_patterns":"","best_channel":"","best_time":"","linkedin_activity":"","phone_accessibility":"","email_preference":"","interested_criteria":"","warm_criteria":"","meeting_ready_criteria":"","not_now_criteria":"","dead_criteria":""},"confidence":{}}
co_sizes: array from ["SMB 1–50","Mid-Market 51–500","Enterprise 500+"]
tone: one of "Consultative & Educational"|"Direct & Punchy"|"Casual & Conversational"|"Formal & Executive"|"Data-driven & Analytical"|"Blue Collar & Human"|"Blunt & Edgy"|"Confrontational"
cta: one of "15-min call ask"|"Soft permission ('worth a chat?')"|"Video/resource share"|"Direct demo ask"|"Open-ended question"|"Easy yes/no reply"|"Direct callback ask"
best_channel: one of "Email"|"LinkedIn"|"Phone"|"Multi-channel (Email + LinkedIn)"|"Multi-channel (All)"
linkedin_activity: one of "Very Active (posts/comments weekly)"|"Moderate (engages occasionally)"|"Low (profile exists, rarely active)"
phone_accessibility: one of "Direct dial available"|"Gatekeeper (assistant)"|"Voicemail only"
email_preference: one of "Responds to short punchy emails"|"Prefers detailed/professional"|"Responds to personalization"|"Responds to data/stats"
```

### Output
`app_data[personas_job_<wsId>].result = { personas: [ { id, name, fields, confidence } ] }`.
Client merges each persona's `fields` into the matching `icps[]` entry by `id`.

---

# STAGE 5 — Outreach Campaigns (client-side, `App.tsx`)

Not an edge function — generated in the browser via the `ai-proxy` (`callAI`).
For up to **3 product × persona combos**, it produces **1 LinkedIn sequence + 3
email campaigns** (Conversation Starter / Meeting CTA / Value-Based CTA), each a
5-touch sequence. A "voice/strategy profile" (playbook) can steer tone.

### The 3 email campaign definitions (`obEmailDefs`)
```js
{ suffix:"Email 1 — Conversation Starter", ctaInstr:"Lead with value (free audit, consultation, or industry insight). No hard ask. Soft CTA only — e.g. 'Worth a quick look?', 'Thoughts?'. Never ask for a meeting." }
{ suffix:"Email 2 — Meeting CTA",          ctaInstr:"Direct ask for a meeting or demo. Short, confident, clear. CTA must directly ask for a meeting — e.g. 'Open to a 15-min call?', 'Worth 20 minutes?'. No soft hedging." }
{ suffix:"Email 3 — Value-Based CTA",      ctaInstr:"Offer clear value before asking for the meeting. Works well on colder or larger audiences. Structure: problem → outcome → offer → CTA. e.g. 'Worth seeing how we'd approach this for you?'." }
```

### Context object (`ctx`, stringified to ≤4000 chars and inserted as `Context:`)
```json
{
  "company": { ...companyData, ...extracted.companyUpdates },
  "icp":     { ...persona.data, "name": "<persona name>" },
  "product": { "name","description","valueProposition","keyFeatures","problemsSolved","elevatorPitch" }
}
```
`onboardingBlock` (appended to every campaign prompt) carries the messaging
direction / instructions / avoid-topics extracted from the onboarding call +
implementation form. `pbBlock` carries the selected playbook voice profile.

### 5a. Email strategy brief prompt (max_tokens 800)
```
Generate a campaign strategy brief for EMAIL cold outreach.
Context: ${ctxStr}
${pbBlock}${onboardingBlock}
Write a focused strategy brief that the email copy will be based on. Cover:

**ICP SNAPSHOT** (2 sentences — who they are and what drives them)

**LEAD PAIN** (the sharpest pain — must stop a scroll)

**MESSAGE ARCHITECTURE**
Hook: [opening angle]
Value: [what we offer against the pain]
Proof: [credibility signal]
CTA: [low-friction ask]

**5-EMAIL SEQUENCE STRATEGY**
Email 1 (Day 0): [angle]
Email 2 (Day 3): [angle]
Email 3 (Day 7): [angle]
Email 4 (Day 14): [angle]
Email 5 (Day 21): [angle — breakup]

**PERSONALIZATION LAYERS**
1. [layer]
2. [layer]
3. [layer]

HARD RULE: No links or URLs anywhere in the email sequence. All CTAs must be reply-based only.
```

### 5b. Email sequence copy prompt (per campaign def, max_tokens 1400)
```
Write a 5-email cold outreach sequence. Real emails, not templates. Max 100 words each body.

Context: ${ctxStr}
${pbBlock}${onboardingBlock}
EMAIL STRATEGY (follow this exactly):
${emailStrategy.slice(0, 1200)}

CTA STYLE FOR THIS CAMPAIGN: ${def.ctaInstr}

Rules:
- Email 1 (Day 0): lead with the LEAD PAIN — hook, short, personal
- Email 2 (Day 3): different angle + trigger event
- Email 3 (Day 7): proof/social proof + objection addressed
- Email 4 (Day 14): gain angle
- Email 5 (Day 21): breakup — direct, human, low-friction
- ALL CTAs must strictly follow the CTA STYLE above.
- ZERO links or URLs in any email. CTAs must be reply-based only.

Return ONLY valid JSON:
{"steps":[{"stepNumber":1,"role":"hook","dayOffset":0,"subject":"...","body":"..."},{"stepNumber":2,"role":"proof","dayOffset":3,"subject":"...","body":"..."},{"stepNumber":3,"role":"value","dayOffset":7,"subject":"...","body":"..."},{"stepNumber":4,"role":"urgency","dayOffset":14,"subject":"...","body":"..."},{"stepNumber":5,"role":"breakup","dayOffset":21,"subject":"...","body":"..."}]}
```

### 5c. LinkedIn strategy prompt (max_tokens 700)
```
Generate a campaign strategy brief for LINKEDIN outreach.
Context: ${ctxStr}
${pb.key !== "auto" ? `LinkedIn voice: ${pb.linkedin||pbBlock}` : ""}${onboardingBlock}
Write a focused LinkedIn strategy that the message sequence will be based on. Cover:

**ICP SNAPSHOT** (2 sentences)

**LINKEDIN-SPECIFIC ANGLE** (what makes this persona responsive on LinkedIn)

**5-TOUCH MESSAGE ARC**
Touch 1 (Day 0 — connection): [angle]
Touch 2 (Day 2): [angle]
Touch 3 (Day 5): [angle]
Touch 4 (Day 10): [angle]
Touch 5 (Day 17 — breakup): [angle]

**CTA APPROACH** (ultra-low-friction)

**PERSONALIZATION SIGNALS** (what to look for in their LinkedIn profile)
```

### 5d. LinkedIn sequence copy prompt (max_tokens 900)
```
Write a 5-touch LinkedIn outreach sequence. Max 300 chars for connection request, 500 chars for messages.

Context: ${ctxStr}
${pb.key !== "auto" ? `LinkedIn voice: ${pb.linkedin||""}` : ""}${onboardingBlock}
LINKEDIN STRATEGY (follow this exactly):
${linkedinStrategy.slice(0, 1000)}

Rules:
- Touch 1 (Day 0): connection request only — personal reason to connect, NO pitch
- Touch 2-5: conversational DMs adapted for LinkedIn format
- CTAs ultra-low-friction

Return ONLY valid JSON:
{"steps":[{"stepNumber":1,"role":"connection","dayOffset":0,"body":"connection request text"},{"stepNumber":2,"role":"follow_up","dayOffset":2,"body":"message"},{"stepNumber":3,"role":"value","dayOffset":5,"body":"message"},{"stepNumber":4,"role":"proof","dayOffset":10,"body":"message"},{"stepNumber":5,"role":"breakup","dayOffset":17,"body":"message"}]}
```

### 5e. North-Star strategy prompt (max_tokens 600)
```
Generate a North Star strategy for this company, informed by onboarding.
Company: ${JSON.stringify({ ...cd, ...extracted.companyUpdates })}
Products (prioritised): ${sortedProds.map(p=>p.name).join(", ")}
Personas (prioritised): ${sortedPersonas.map(p=>p.name).join(", ")}
Onboarding direction: ${extracted.messagingDirection}
Specific instructions: ${extracted.specificInstructions}
Return ONLY valid JSON:
{"northStar":{"icp":"1-sentence ICP definition","corePain":"primary pain we solve","primaryChannel":"Email + LinkedIn","channelReason":"why","goal90Days":"90-day measurable goal"},"bets":[{"hypothesis":"We believe [persona] will respond to [angle] through [channel] because [reason]","channel":"Email","personaRef":"persona name","angle":"messaging angle","status":"proving"}]}
```

---

# TRACK B — Infrastructure (`infra-run`)

Sizes and generates `.com` sending domains + mailboxes **from the intake form
alone** — no dependency on the TAM tree, so it runs fully parallel from intake
submit. Mostly deterministic; uses haiku only to top up domain stems.

### Request body
```json
{
  "workspaceId": "string (required)",
  "infraInputs": {
    "primaryWebsite": "company.com",
    "forwardingDomain": "where domains redirect",
    "domainCount": 67,
    "mailboxCount": 201,
    "brandWord": "optional override",
    "mailboxNames": [ { "name": "Jane Smith", "percent": 50 } ]
  }
}
```

### Sizing constants & logic
```
PER_MAILBOX_DAILY = 30, WORKING_DAYS_PER_MONTH = 22, MAILBOXES_PER_DOMAIN = 3
DEFAULT_DOMAINS = 67, DEFAULT_MAILBOXES = 201
```
- **user_specified:** explicit domain/mailbox counts (clamped: domains 1–300)
- **intake_target_volume:** `mailboxes = ceil(targetMonthlyVolume / (30 × 22))`,
  `domains = ceil(mailboxes / 3)` (clamped 1–200), then `mailboxes = domains × 3`
- **default:** 67 domains / 201 mailboxes

### Domain stem generation (deterministic, `generateStems`)
Brand word derived from `primaryWebsite` host (or company name, or `brandWord`
override). Combined with:
```
prefixes: get try go my meet join use run hello ask all top best fast new pro we by hey with hi
suffixes: hq app team co hub labs pro now up biz mail digital online direct global works cloud
          send reach zone base desk box line edge plus one center corp studio agency web first
          core flow link key ace net io
```
Each stem 5–22 chars; `.com` only. Mailbox local-parts: `first`, `first.last`,
`firstL`, `flast`. Senders distributed across domains by their `percent` allocation.

### AI top-up prompt (haiku, only if deterministic generator falls short)
- `model: "claude-haiku-4-5-20251001"`, `max_tokens: 1000`, System: `Return only valid JSON.`
```
Generate ${(domainCount - stems.length) * 3} creative cold-email domain stems for "${cd.co_name}" (${cd.co_industry}). Brand word: "${brand}". Every stem MUST contain the brand word. Stems only — no TLD. Already used: ${stems.slice(0,40).join(",")}. Return ONLY JSON array of stems: ["name1","name2",...]
```

### Output (`result.dfySetup`)
```json
{
  "tlds": [".com"], "domainCount": 67, "mailboxCount": 201, "mailboxesPerDomain": 3,
  "mailboxes": [ { "address": "jane@getacme.com", "domain": "getacme.com", "senderName": "Jane Smith" } ],
  "primaryWebsite": "...", "forwardingDomain": "...", "targetMonthlyVolume": null,
  "mailboxNames": [ { "name","firstName","lastName","percent","allocation" } ],
  "suggestedDomains": [ { "domain": "getacme", "tld": ".com", "full": "getacme.com" } ],
  "approvedDomains": [ "getacme", ... ],
  "sizingBasis": "user_specified|intake_target_volume|default",
  "generatedAt": "ISO"
}
```

---

# Post-onboarding — Deep ICP Tree (`icp-tree-expand`)

Not part of the gated sequence, but seeds itself from Stage 3's output. Deepens
one ICP branch on demand: **Persona → JTBD → Trigger → Readiness State → Play**.

### Request body
```json
{ "workspaceId": "...", "action": "expand_icp|generate_play|regenerate_play", "icpId": "...", "rsId": "...", "hint": "..." }
```

### Model / params
- Personas/JTBDs/Triggers: `claude-haiku-4-5-20251001`; Plays: `claude-sonnet-4-6`
- **System prompt:** `You are a B2B go-to-market strategist. Return ONLY valid JSON — no markdown, no explanation, no preamble. Do not wrap in code fences.`
- `expand_icp` authors plays for the top `PLAYS_PER_ICP = 6` ranked readiness leaves.

### Company context (`ctxStr`, prepended to every sub-prompt)
```
Company: <co_name>
Industry: <co_industry>
Website: <co_website>
Value proposition: <co_pitch>
Key selling points: <co_ksp>
Products/services: <product names>
Current customers: <co_customers>
Competitors: <co_competitors>
Typical deal size: <co_deal>
Sales cycle: <co_cycle>
Known ICPs/personas: <icp names>
```

### Personas sub-prompt (haiku, max_tokens 1500)
```
${ctx}

ICP: ${icp.name}
Motion: ${icp.motion}
Firmographics: ${JSON.stringify(icp.firmographics)}
Pain profile: ${icp.pain_profile}

Generate all distinct buyer personas for this ICP. Include both decision makers and champions/influencers. Typically 1-3 personas. Max: ${maxPersonas}.

Return JSON array:
[{
  "title": "exact job title",
  "seniority": "C-suite|VP|Director|Manager|Individual Contributor",
  "department": "Sales|Marketing|Engineering|Finance|Operations|HR|etc",
  "goals": ["goal1", "goal2", "goal3"],
  "fears": ["fear1", "fear2"],
  "objections": ["typical objection 1", "typical objection 2"],
  "channels": ["email", "linkedin", "phone"],
  "expansion_status": "complete|expandable",
  "expansion_hints": []
}]
```

### JTBD sub-prompt (haiku, max_tokens 1200)
```
${ctx}

ICP: ${icp.name} — ${icp.pain_profile}
Persona: ${persona.title} (${persona.seniority})
Goals: ${persona.goals.join(", ")}
Fears: ${persona.fears.join(", ")}

Generate the Jobs to be Done for this persona in this ICP context. Each JTBD is a specific situation+motivation+outcome. Max: ${maxJTBDs}.

Return JSON array:
[{
  "job_statement": "When [situation], I want to [motivation], so I can [outcome]",
  "functional_outcome": "concrete measurable result",
  "emotional_outcome": "how they feel when job is done well",
  "success_metrics": ["metric1", "metric2"],
  "expansion_status": "complete|expandable",
  "expansion_hints": []
}]
```

### Triggers sub-prompt (haiku, max_tokens 1200)
```
${ctx}

ICP: ${icp.name}
Persona: ${persona.title}
JTBD: ${jtbd.job_statement}

Generate the observable trigger events that indicate this persona is actively experiencing this job-to-be-done. Triggers should be detectable via LinkedIn, job postings, news, or data signals. Max: ${maxTriggers}.

Return JSON array:
[{
  "name": "short trigger name",
  "description": "what happened and why it matters",
  "detection_method": "how to find this signal (LinkedIn post, job posting, news, etc.)",
  "detection_difficulty": "easy|medium|hard",
  "urgency": "low|medium|high|critical",
  "example_signals": ["specific signal example 1", "specific signal example 2"],
  "expansion_status": "complete|expandable",
  "expansion_hints": []
}]
```

### Readiness states — deterministic (no LLM)
Generated from `trigger.urgency` (`critical`/`high`/`medium`/`low`), each state
carrying `{ state, description, timing_window, behavioral_signals }`. E.g. for
`critical`: acute (0-7 days) → active (1-4 weeks) → aware (1-3 months).

### Play sub-prompt (sonnet, max_tokens 1200)
The 10 playbook voices offered to the model:
```
Value-Stack Operator (Alex Hormozi) — dollar-denominated pain, value stack, hard CTA
High-Energy Hustler (Gary Vaynerchuk) — informal, urgent, low-friction ask
Trust-Led Analyst (Warren Buffett) — credibility first, folksy precision, zero pressure
Tactical Negotiator (Chris Voss) — calibrated questions, labels, tactical empathy, pull don't push
Classic Craft Copywriter (David Ogilvy) — facts as persuasion, one big idea, elegant structure
Idea-Forward Minimalist (Seth Godin) — one idea, three sentences, permission-based
Data Storyteller (Andrew Chen) — metric → hypothesis → peer result → framework offer
Permission Challenger (Josh Braun) — pattern interrupt, takeaway selling, permission-based
Technical Founder Essayist (Paul Graham) — first principles, short declaratives, peer-to-peer
Plainspoken Trade Voice (Mike Rowe) — plain English, dignity-of-work, concrete help
```
```
${ctx}

ICP: ${icp.name} — ${icp.firmographics?.company_size}, ${icp.firmographics?.industries.join("/")}
Persona: ${persona.title} (${persona.seniority}, ${persona.department})
JTBD: ${jtbd.job_statement}
Trigger: ${trigger.name} — ${trigger.description}
Readiness: ${rs.state} — ${rs.description} (${rs.timing_window})
Detection method: ${trigger.detection_method}
${hint ? `\nEXTRA GUIDANCE (weight heavily): ${hint}\n` : ""}
Available playbook voices:
<the 10 voices above>

Generate a complete outreach play brief for this exact leaf. Choose the best playbook voice for this persona+readiness combination.

Return JSON:
{
  "name": "short play name",
  "channel": "email|linkedin|email+linkedin|multi",
  "playbook_voice": "exact playbook name from the list above",
  "hook": "1-2 sentence opening hook that references the trigger",
  "value_prop": "specific value proposition for this persona+JTBD combination",
  "proof_point": "specific proof — customer story, stat, or social proof",
  "primary_cta": "exact CTA text",
  "objection_handler": "how to handle the most likely objection",
  "sequence_strategy": "3-5 sentence description of the full sequence arc (touch 1 → 5)",
  "messaging_angles": ["angle1 to test", "angle2 to test", "angle3 to test"],
  "personalization_tokens": ["{trigger_event}", "{company_name}", "other tokens to personalize"],
  "disqualifiers": ["who NOT to send this to"],
  "expansion_hints": ["A/B variant worth testing", "channel variant to add"]
}
```

---

## Reproducing a single stage outside the app — checklist

1. Provide an `ANTHROPIC_API_KEY`.
2. **Stage 1:** fetch the site text yourself (or paste it), build `userContext`,
   POST to the messages API with the Stage-1 prompt → you get the research brief JSON.
3. **Stages 2–4:** feed the Stage-1 brief JSON into the respective context block,
   then run that stage's prompt. They chain: brief → products → TAM/ICPs (needs
   products) → personas (needs scored ICPs).
4. Parse `content[0].text` as JSON (strip ```` ```json ```` fences / extract the
   outermost `{...}` if needed).
5. The whole sequence is reproducible from just the **brief** + the prompts here —
   the app's edge functions add only job-row plumbing, retries, and streaming.
