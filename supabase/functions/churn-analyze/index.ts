// churn-analyze — edge function
// Analyzes churned VIP customers: churn reason from HubSpot activity + ICP qualification scoring
// Receives pre-fetched HubSpot activity from the frontend; does webscraping + AI analysis.
//
// Required: ANTHROPIC_API_KEY (Supabase secret)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function fetchPageText(url: string): Promise<string> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; research-bot/1.0)" },
      signal: AbortSignal.timeout(12000),
    });
    const html = await r.text();
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 7000);
  } catch {
    return "";
  }
}

async function callAI(key: string, prompt: string, tokens = 2200): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: tokens,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(50000),
  });
  if (!r.ok) {
    const errBody = await r.text().catch(() => "");
    console.error(`[churn-analyze] Anthropic HTTP ${r.status}: ${errBody.slice(0, 500)}`);
    throw new Error(`Anthropic ${r.status}: ${errBody.slice(0, 300)}`);
  }
  const json = await r.json();
  return json.content?.[0]?.text ?? "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { companies } = await req.json();
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "Missing ANTHROPIC_API_KEY" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(companies) || companies.length === 0) {
      return new Response(JSON.stringify({ error: "companies array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allResults: any[] = [];
    const batchResults = await Promise.all(companies.map(async (c: any) => {
      const { domain, companyName, hubspotId, website, activityText, companyInfo } = c;

      // Scrape website
      const siteUrl = website?.startsWith("http")
        ? website
        : domain ? `https://${domain}` : "";
      const siteText = siteUrl ? await fetchPageText(siteUrl) : "";

      const companyInfoStr = companyInfo
        ? `Industry: ${companyInfo.industry || "unknown"} | Employees: ${companyInfo.numberofemployees || "unknown"} | Revenue: ${companyInfo.annualrevenue || "unknown"}`
        : "";

      const prompt = `You are a senior B2B sales qualification analyst. Analyze this churned client using the ICP Qualification Framework below. Your job is to score them across 3 dimensions and determine re-engagement fit.

COMPANY: ${companyName} (${domain})
${companyInfoStr ? `PROFILE: ${companyInfoStr}` : ""}

WEBSITE CONTENT:
${siteText || "(website unavailable)"}

EMAIL/ACTIVITY HISTORY (full HubSpot communications log):
${activityText || "(no activity recorded)"}

---
B2B ROCKET CONTEXT:
B2B Rocket is a $5,000/month managed AI outbound service (cold email + LinkedIn). Email warmup takes ~60 days before meaningful volume. Each churned client costs ~$30,000. You are assessing whether they should be re-sold into VIP.

---
ICP FIT VS CHURN REASON — THESE ARE COMPLETELY SEPARATE ANALYSES:

CHURN REASON: Why did the previous engagement fail? Use the activity log as your primary source. This is purely historical context.

ICP FIT: Is this company a good structural fit for the B2B Rocket VIP program TODAY? Score this as if you have never seen their activity log. Base it entirely on their business model, market, and team structure — things that are true regardless of what happened during their last engagement.

THE RULE: The activity log must NOT influence ICP scores unless the signal directly reveals a structural truth about one of the three dimensions:
- It may inform ROI Fit only if the client explicitly revealed their deal sizes or sales cycle length (e.g., "our average deal is $800" or "our contracts take 6 months to close")
- It may inform Sales Capacity only if it reveals the client's team structure (e.g., "we have a 5-person sales team" or "it's just me, I can't follow up on leads")
- It may inform Audience Clarity only if it reveals the client's target market (e.g., "we sell to mid-market HR directors" or "we have no idea who to target")

Everything else in the activity log — complaints about B2B Rocket, cancelled because of no results, unhappy with email quality, wanted a refund, thought warmup was too slow, rep left, budget cut, didn't understand the product — is irrelevant to ICP scoring. These are engagement problems, not structural disqualifiers.

SCORING PHILOSOPHY: Each dimension requires genuine positive evidence to PASS. Thin or ambiguous evidence = UNSURE. Structural problems = FAIL. Do not award PASS simply because a company is a B2B business — that's the baseline, not a qualifier. UNSURE is the correct default when you can't confirm something from their business model or market; PASS requires you to actually confirm it.

ICP SCORING EVIDENCE SOURCES (in priority order):
1. Website content — what they sell, who they sell to, team size, pricing signals, case studies
2. Company profile — industry, employee count, annual revenue
3. Activity log — only the narrow structural signals listed above; everything else is ignored

---
ICP QUALIFICATION FRAMEWORK:

DIMENSION 1 — ROI FIT
Core question: Can one closed deal justify the $5k/month spend?

(a) AOV ≥$5k
PASS requires positive evidence: website pricing, case studies mentioning contract sizes, revenue per employee suggesting large deals, activity log mentioning deal sizes, or an industry where high-value contracts are the only viable model (enterprise cybersecurity, executive recruiting, M&A advisory, large-scale IT infrastructure).
UNSURE: Industry could go either way, or company is too small/early to confirm deal sizes. Most generic "consulting," "services," or "software" companies land here unless you have specific evidence.
FAIL: Clear evidence of sub-$2k deal sizes — consumer-facing pricing, transactional low-ticket model, client explicitly mentioned tiny deals.

(b) Sales cycle ≤75 days
PASS: Industry is explicitly short-cycle with evidence (staffing/recruiting 14-30d, SMB SaaS with self-serve or short trials, high-velocity transactional services). Activity log shows rapid close mentions.
UNSURE: Standard B2B services without a clear signal either way — this is the default for most professional services, consulting, and mid-market SaaS.
FAIL: Known long-cycle categories: government procurement, large enterprise with formal RFP, construction/real estate development, regulated industries with committee approval processes.

(c) Recurring revenue (positive signal only — cannot fail)
PRESENT, ABSENT, or UNSURE. Managed services, retainers, staffing placements, SaaS subscriptions = PRESENT.

(d) Gross margin
Apply business model norms: SaaS/software 70-85%, consulting/services 40-80%, staffing/recruitment ~25-40%, MSPs 50-70%, physical products 15-25%.

DIMENSION 1 VERDICT LOGIC:
- PASS = both (a) and (b) PASS with actual supporting evidence
- UNSURE = either (a) or (b) is UNSURE with no clear fails (most common outcome for thin evidence)
- FAIL = (a) or (b) clearly fails
Sub-criteria (c) and (d) inform rationale only.

DIMENSION 2 — CLIENT SALES CAPACITY
Core question: Does this company have the internal team and infrastructure to close deals when we deliver leads?
This is about THEIR ability to sell — do they have dedicated people who handle sales, not just the founder wearing every hat?

PASS requires specific evidence of sales infrastructure: named sales roles on the website or LinkedIn (Account Executive, BDR, VP Sales, Sales Director), OR the activity log explicitly mentions their sales team handling leads, OR the company is large enough (20+ employees) with a clearly productized offering that implies a sales motion.
UNSURE: Company has some employees but no visible sales roles; small team (under 15) where it's unclear who closes; founder-led with no contrary evidence. This is the default for most small businesses.
FAIL: Solo operator/freelancer clearly running everything alone. Activity log shows the owner is the bottleneck — missed calls, couldn't follow up, explicitly said they have no one else. Business appears to be a personal brand rather than a scalable company.

Engagement problems alone do NOT equal no sales capacity.

DIMENSION 3 — AUDIENCE CLARITY (Apollo Targeting)
Core question: Can we build high-converting prospect lists in Apollo.io for this company?
Think like an Apollo user: you need a specific job title + industry + company size combination that produces a list of at least several thousand prospects. Vague targeting = UNSURE.

PASS: You can articulate a precise Apollo search: specific job titles (not "decision makers" — actual titles like "VP of Operations," "Director of IT," "Chief Revenue Officer") + specific industry filters + company size range. The resulting addressable market must be large enough for 6+ distinct audience variations. The company sells something that a cold email could plausibly convert.
UNSURE: B2B but buyer titles are ambiguous, industry is too broad or generic, or the offering applies to "any company" without a clear persona. Also UNSURE if the product/service is unclear from available sources.
FAIL: Purely B2C with no business buyer segment, government/public sector only, market is demonstrably too niche (sub-1000 total addressable companies), or selling something where cold email has near-zero conversion potential (deeply referral-dependent professional services, regulated products requiring in-person relationships).

OVERALL VERDICT LOGIC:
- "Likely Fit" = 2 or 3 dimensions PASS, 0 FAILs
- "Needs Review" = 1 PASS + UNSUREs, or all 3 UNSURE — has potential but gaps remain
- "Disqualified" = 1 or more dimension FAILs

---
Return ONLY valid JSON (no markdown, no explanation):
{
  "churnReason": "1-2 sentence concise reason they churned — must reference specific events or quotes from the activity log",
  "churnReasonDetail": "3-5 sentence detailed analysis: timeline of what went wrong, root cause, and key signals from the communications",
  "churnProofPoints": [
    "Array of 3-6 direct proof points from the activity log. Each entry must cite a specific date, quote, or event. Format: 'Mon DD YYYY: [exact quote or specific event description]'. Pull the most damning/revealing signals — what the client actually said, when they went quiet, when they complained, when they cancelled. If no activity log exists, return an empty array."
  ],

  "aov": "PASS|FAIL|UNSURE",
  "aovReason": "Base this on website pricing, industry, and company profile. Only reference the activity log if the client explicitly stated their deal sizes.",
  "salesCycle": "PASS|FAIL|UNSURE",
  "salesCycleReason": "Base this on industry norms and business model. Only reference the activity log if the client explicitly stated their close timelines.",
  "recurringRevenue": "PRESENT|ABSENT|UNSURE",
  "recurringRevenueReason": "Based on business model — subscriptions, retainers, one-off projects.",
  "grossMargin": "high|medium|low",
  "grossMarginReason": "Estimated margin band based on business model type.",
  "roiFit": "PASS|FAIL|UNSURE",
  "roiFitReason": "Based on business model and market, not on engagement history. Cite what structural evidence drove the verdict.",

  "salesCapacity": "PASS|FAIL|UNSURE",
  "salesCapacityReason": "Based on their team structure: visible sales roles, employee count, and company scale. Only reference the activity log if it revealed something about their team (e.g., they mentioned having a sales team, or explicitly said they are a solo operator).",

  "audienceClarity": "PASS|FAIL|UNSURE",
  "audienceClarityReason": "Based on what they sell and who their buyers are from the website. State the Apollo.io filters you would use. Only reference the activity log if the client described their target market or confirmed they have no ICP.",

  "fitScore": "Likely Fit|Needs Review|Disqualified",
  "overallVerdict": "1-2 sentence synthesis applying the verdict logic above.",
  "recommendation": "Specific actionable recommendation: re-engage timing, what needs to change first, or why excluded."
}`;

      let raw = "";
      let aiError = "";
      try {
        raw = await callAI(anthropicKey, prompt, 2800);
      } catch (e: any) {
        const msg: string = e.message || "AI call failed";
        // Parse friendly error for credit/auth issues
        if (msg.includes("credit balance is too low")) {
          aiError = "Anthropic API credit balance is depleted — top up at console.anthropic.com/billing";
        } else if (msg.includes("401") || msg.includes("invalid_api_key")) {
          aiError = "Anthropic API key is invalid or expired";
        } else {
          aiError = msg.slice(0, 200);
        }
        console.error(`[churn-analyze] ${companyName}: ${msg}`);
      }

      let analysis: any = {
        churnReason: aiError || "Analysis unavailable",
        churnReasonDetail: "",
        churnProofPoints: [],
        aov: "UNSURE",
        aovReason: "",
        salesCycle: "UNSURE",
        salesCycleReason: "",
        recurringRevenue: "UNSURE",
        recurringRevenueReason: "",
        grossMargin: "medium",
        grossMarginReason: "",
        roiFit: "UNSURE",
        roiFitReason: "",
        salesCapacity: "UNSURE",
        salesCapacityReason: "",
        audienceClarity: "UNSURE",
        audienceClarityReason: "",
        fitScore: "Needs Review" as const,
        overallVerdict: "",
        recommendation: "",
      };

      if (raw) {
        try {
          const match = raw.match(/\{[\s\S]*\}/);
          if (match) analysis = JSON.parse(match[0]);
        } catch { /* use defaults */ }
      }

      return { domain, companyName, hubspotId, ...analysis };
    }));
    allResults.push(...batchResults);

    return new Response(JSON.stringify({ results: allResults }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
