// LaunchPad background runner — edge function
// Accepts LP params, responds immediately with jobId, runs the full
// pipeline in the background via waitUntil, writes progress to
// app_data (key: lp_job_<workspaceId>), then sends a Slack DM.
//
// Required Supabase secrets (set via supabase secrets set):
//   ANTHROPIC_API_KEY
//   SUPABASE_URL          (auto-set by Supabase runtime)
//   SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Constants ───────────────────────────────────────────────────────────────

const LP_STEPS = [
  "Fetching website content",
  "Building company profile",
  "Researching products & personas",
  "Building full product profiles",
  "Building full persona profiles",
  "Building intelligence & offers",
  "Generating 67 domains",
  "Generating campaign strategies",
  "Generating sequences",
];

const ICP_COLORS = ["#6C5CE7","#00D68F","#FF6B6B","#54A0FF","#9B59B6","#FFC048","#E84393","#00CEC9"];

const NAMING_RULES = {
  persona: `PERSONA NAMING RULES (strict):
- Format: "[Industry/Vertical] — [Buyer Role]"
- Examples: "SaaS — VP Sales", "Construction SMB — Owner/GM", "Healthcare — IT Director"
- Keep under 40 characters. No marketing fluff, no full sentences.
- Industry should be specific enough to differentiate from other personas.
- Role should be the actual job title or function they hold.`,
  product: `PRODUCT NAMING RULES (strict):
- USE THE EXACT PRODUCT NAME as it appears on the company's website. Do NOT rename or genericize.
- Only simplify when the company uses excessive marketing fluff.
- Keep under 40 characters. Preserve the company's branding.`,
};

// Simplified PLAYBOOKS — only fields used in prompt generation
const PLAYBOOKS: Record<string, any> = {
  auto: { key: "auto", label: "Auto", figure: "", voice: [], strategy: "", opening: "", proof: "", cta: "", avoid: "", linkedin: "" },
  value_stack: {
    key: "value_stack", label: "Value-Stack Operator", figure: "Alex Hormozi",
    voice: ["Short sentences. One thought per line.", "Concrete $ and % numbers.", "Value-stack: list 3 things they get, then the ask.", "Zero filler adjectives — every word earns its spot."],
    strategy: "Hook with a dollar-denominated pain → stack the value → hard CTA early → scarcity on follow-ups.",
    opening: "Lead with a concrete $ or hour cost of the current problem. No pleasantries.",
    proof: "Before/after numbers from comparable customers. Stack 2–3 stats.",
    cta: "Hard ask by touch 2 (15-min call, calendar link). Escalate scarcity on touch 4.",
    linkedin: "Same voice, tighter. Connection note = one pain-stat + 'open to a quick chat?' Messages under 300 chars.",
    avoid: "Don't overuse 'here's the thing' or 'most people won't read this'.",
  },
  high_energy: {
    key: "high_energy", label: "High-Energy Hustler", figure: "Gary Vaynerchuk",
    voice: ["Conversational and informal — contractions and fragments OK.", "Urgency without threat.", "Direct second-person — 'you' in every sentence."],
    strategy: "Lead with energy and action → short punchy sentences → urgency → direct ask.",
    opening: "Start with something happening NOW — a trend, a shift, a market move.", proof: "Real stories over stats.", cta: "'Let's talk this week' energy.", linkedin: "Short bursts. Questions.", avoid: "Don't be fake hype.",
  },
  analytical: {
    key: "analytical", label: "Analytical Challenger", figure: "McKinsey partner",
    voice: ["Data-first assertions.", "Benchmark against industry.", "Question their current assumptions."],
    strategy: "Lead with an industry insight or stat → challenge the status quo → data-backed CTA.",
    opening: "Start with a specific industry benchmark or data point.", proof: "ROI analysis, benchmarks, case study metrics.", cta: "Frame as a 'diagnostic' or 'assessment' — low ego.", linkedin: "Insight-first. One key stat. One question.", avoid: "Don't use fluffy language.",
  },
  challenger: {
    key: "challenger", label: "Challenger Sale", figure: "Matthew Dixon",
    voice: ["Lead with a counter-intuitive insight.", "Reframe how they see the problem.", "Commercial teaching — show them something they don't know."],
    strategy: "Teach → tailor → take control.", opening: "Start with an insight that challenges their assumption.", proof: "Reframes that make them think differently.", cta: "Position you as the guide to solve the reframed problem.", linkedin: "Drop one insight. Ask if it resonates.", avoid: "Don't pitch the product first.",
  },
  relationship: {
    key: "relationship", label: "Relationship Builder", figure: "Zig Ziglar",
    voice: ["Warm but professional.", "Reference specific things about them.", "Long-game mentality."],
    strategy: "Lead with genuine interest → provide value → soft ask.", opening: "Reference something specific about them (a post, news, milestone).", proof: "Stories and testimonials.", cta: "Low pressure. 'Worth a quick chat?' energy.", linkedin: "Highly personal. Always reference their content.", avoid: "Don't rush to the pitch.",
  },
  executive: {
    key: "executive", label: "Executive Brief", figure: "Board memo",
    voice: ["Board-room brevity.", "P&L language.", "Outcome-first."],
    strategy: "Open with the business impact → state the risk of inaction → one ask.", opening: "State the business outcome in the first sentence.", proof: "Revenue/cost/risk numbers only.", cta: "One ask. No options.", linkedin: "Even shorter. One sentence each.", avoid: "No feature lists. No pleasantries.",
  },
};

// Product field IDs (subset used for EMPTY_PRODUCT)
const PRODUCT_FIELD_IDS = [
  "name","description","category","useCases","keyFeatures","problemsSolved","valueProposition",
  "timeToValue","idealCustomer","marketMaturity","competitors","buyerObjections","switchTriggers",
  "dealType","acv","mrr","contractLength","renewalRate","expansionRevenue","ltv","avgDealSize",
  "repeatRate","referralRate","avgDaysToClose","closeRateByStage","dealStakeholders",
  "discountAuthority","paymentTerms","proofPoints","roiMetrics","caseStudies","industryProof",
  "socialProof","objectionRebuttals","unsolvedImpact","elevatorPitch","positioningStatement",
  "messagingDos","messagingDonts","prod_notes",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid(): string {
  return crypto.randomUUID();
}

function EMPTY_PRODUCT(): any {
  return { id: uid(), ...Object.fromEntries(PRODUCT_FIELD_IDS.map(f => [f, ""])), sourceUrl: "", createdAt: new Date().toISOString() };
}

function EMPTY_CAMPAIGN(): any {
  return {
    id: uid(), name: "", status: "planning", channel: "email", type: "cold_email",
    intentTier: "cold", playbook: "auto", goal: "", goalType: "book_meetings", diagnostic: null,
    personaIds: [], productId: "", offerId: "", strategyPhaseId: null,
    audienceSource: "people_search", rtsListId: null, customListName: "",
    targeting: { titles: "", seniority: "", departments: "", industries: "", companySizes: "", revenue: "", personLocation: "", companyLocation: "", keywords: "", technologies: "", intentTopics: "", excludedDomains: "", excludedCompetitors: "" },
    senderConfig: { accountsNeeded: 3, warmupRequired: true, dailyVolumePerAccount: 50 },
    sendingSchedule: { timezone: "client_local", days: ["Mon","Tue","Wed","Thu"], startHour: 9, endHour: 17 },
    safetyLimits: { autoPauseOnBounce: true, bouncePauseThreshold: 8, autoPauseOnLowReply: true, lowReplyThreshold: { sentCount: 300, repliesAtMost: 0 } },
    sequence: [], abTests: [], handoffCriteria: "", notes: "", createdAt: new Date().toISOString(),
  };
}

function EMPTY_OFFER(productId: string, tier: string, personaId = "", purpose = ""): any {
  return { id: uid(), productId, tier, personaId, purpose, name: "", ctaText: "", whatTheyGet: "", frictionReduction: "", acv: null, avgSalesCycleDays: null, demoToCloseRate: null, coldToDemoRate: null, usedInCampaigns: [], replyRate: null, createdAt: new Date().toISOString() };
}

function newICP(idx: number, data: any = {}, name = "", confidence: any = {}): any {
  return {
    id: uid(), color: ICP_COLORS[idx % ICP_COLORS.length], name, data, outputs: null,
    approval: "draft", sectionApprovals: {}, comments: [], confidence,
    linkedProductIds: [], linkedOfferIds: [],
    linkedProductFit: {} as Record<string, string>,
    linkedProductFitReason: {} as Record<string, string>,
  };
}

function normalizeIntake(raw: string): string {
  let t = raw;
  t = t.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ");
  t = t.replace(/([a-zA-Z])\s*[;|/]\s*([a-zA-Z])/g, "$1, $2");
  return t;
}

// For the edge function we use r.jina.ai which returns clean markdown text.
// This avoids DOMParser (browser-only) and CORS proxies.
async function fetchPageText(url: string): Promise<string> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const r = await fetch(jinaUrl, {
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return "";
    const text = await r.text();
    if (!text || text.length < 200) return "";
    return text.slice(0, 12000);
  } catch {
    return "";
  }
}

// Extract heading structure from markdown text (simulates extractOfferingStructure)
function extractHeadingStructure(md: string): string {
  const lines = md.split("\n");
  const headings: string[] = [];
  for (const line of lines) {
    const m = line.match(/^(#{1,4})\s+(.+)/);
    if (m) headings.push(`H${m[1].length}: ${m[2].trim().slice(0, 140)}`);
    if (headings.length >= 80) break;
  }
  return headings.length ? `HEADINGS (${headings.length}):\n${headings.join("\n")}` : "";
}

// Extract links from markdown text
function extractMarkdownLinks(md: string, _baseUrl: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const m of md.matchAll(/https?:\/\/[^\s\)\"\']+/g)) {
    const u = m[0].replace(/[.,;]+$/, "");
    if (!seen.has(u)) { seen.add(u); urls.push(u); }
    if (urls.length >= 30) break;
  }
  return urls;
}

// ─── AI call ─────────────────────────────────────────────────────────────────

async function callAI(
  anthropicKey: string,
  prompt: string,
  sys = "",
  tokens = 800,
  retries = 5,
): Promise<string> {
  const sysMsg = sys || "You are a senior B2B cold outreach strategist. Be direct, specific, no filler.";
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: tokens,
          system: sysMsg,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (r.status === 429 || r.status === 529 || r.status >= 500) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        if (attempt < retries) { await sleep(delay); continue; }
        return `Error: Rate limited after ${retries} retries`;
      }
      const json = await r.json();
      if (json.error) return `Error: ${json.error.message}`;
      return json.content?.[0]?.text ?? "";
    } catch (e) {
      if (attempt < retries) { await sleep(1000 * Math.pow(2, attempt)); continue; }
      console.error("callAI failed:", e);
      return "";
    }
  }
  return "";
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Progress writer ──────────────────────────────────────────────────────────

async function writeProgress(
  supabase: ReturnType<typeof createClient>,
  jobKey: string,
  patch: Record<string, unknown>,
) {
  try {
    const { data } = await supabase.from("app_data").select("value").eq("key", jobKey).single();
    const current = data?.value ? JSON.parse(data.value as string) : {};
    const updated = { ...current, ...patch };
    await supabase.from("app_data").upsert({ key: jobKey, value: JSON.stringify(updated) }, { onConflict: "key" });
  } catch (e) {
    console.error("writeProgress failed:", e);
  }
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

async function runPipeline(
  params: {
    url: string; extraText: string; linkedin: string; extraUrls: string;
    offerings: string; playbookKey: string; salesContext: string;
  },
  anthropicKey: string,
  supabase: ReturnType<typeof createClient>,
  jobKey: string,
): Promise<any> {
  const upd = (step: number, phase: string) =>
    writeProgress(supabase, jobKey, { step, phase });

  let normUrl = params.url.trim();
  if (normUrl && !/^https?:\/\//i.test(normUrl)) normUrl = `https://${normUrl}`;
  let normLinkedin = params.linkedin.trim();
  if (normLinkedin && !/^https?:\/\//i.test(normLinkedin)) normLinkedin = `https://${normLinkedin}`;

  const salesBlock = params.salesContext.trim()
    ? `\nSALES CONTEXT (from pre-sales calls and notes — use to enrich and validate, not replace web research):\n${params.salesContext.trim().slice(0, 5000)}\n`
    : "";

  // ── STEP 1: Fetch website content ──
  await upd(1, LP_STEPS[0]);
  let context = "";
  let structureContext = "";

  if (normUrl) {
    const homeText = await fetchPageText(normUrl);
    if (homeText) {
      context += `\n\nWEBSITE HOMEPAGE (${normUrl}):\n${homeText}`;
      const structure = extractHeadingStructure(homeText);
      if (structure) structureContext += `\n\n── HOMEPAGE (${normUrl}) ──\n${structure}`;

      // Discover and fetch up to 4 sub-pages from links in the markdown
      const allLinks = extractMarkdownLinks(homeText, normUrl);
      const baseDomain = (() => { try { return new URL(normUrl).hostname.replace(/^www\./, ""); } catch { return ""; } })();
      const subPicks = allLinks.filter(u => {
        try {
          const hn = new URL(u).hostname.replace(/^www\./, "");
          if (hn !== baseDomain) return false;
          const path = new URL(u).pathname.toLowerCase();
          if (/\/blog|\/login|\/register|\/terms|\/privacy|\/career|\/news|\/cart|\/checkout|\/account|\/policy|\/faq|\/contact|\/wp-|\/sitemap|\/feed|\/404|\/search|\/tag\/|\/category\//i.test(path)) return false;
          return /\/(product|service|solution|about|platform|feature|pricing|offering|what-we-do|capabilit)/i.test(path);
        } catch { return false; }
      }).slice(0, 4);

      if (subPicks.length > 0) {
        const subResults = await Promise.allSettled(subPicks.map(u => fetchPageText(u)));
        for (let i = 0; i < subResults.length; i++) {
          const r = subResults[i];
          if (r.status === "fulfilled" && r.value) {
            context += `\n\nPRODUCT/ABOUT PAGE (${subPicks[i]}):\n${r.value}`;
            const s = extractHeadingStructure(r.value);
            if (s) structureContext += `\n\n── ${subPicks[i]} ──\n${s}`;
          }
        }
      }
    } else {
      context += `\n\nWEBSITE URL: ${normUrl}`;
    }
  }

  // Extra URLs
  if (params.extraUrls.trim()) {
    const extraList = params.extraUrls.split(/[\n,]+/).map((u: string) => u.trim()).filter(Boolean)
      .map((u: string) => /^https?:\/\//i.test(u) ? u : `https://${u}`);
    if (extraList.length > 0) {
      const results = await Promise.allSettled(extraList.slice(0, 6).map(async (u: string) => {
        const text = await fetchPageText(u);
        return { url: u, text, structure: text ? extractHeadingStructure(text) : "" };
      }));
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.text.length > 100) {
          context += `\n\nADDITIONAL PAGE (${r.value.url}):\n${r.value.text}`;
          if (r.value.structure) structureContext += `\n\n── ${r.value.url} ──\n${r.value.structure}`;
        }
      }
    }
  }

  // LinkedIn
  if (normLinkedin) {
    const liText = await fetchPageText(normLinkedin);
    context += liText ? `\n\nLINKEDIN PAGE (${normLinkedin}):\n${liText}` : `\n\nLINKEDIN URL: ${normLinkedin}`;
  }

  if (params.offerings.trim()) context = `USER-PROVIDED PRODUCTS & SERVICES (authoritative):\n${params.offerings.trim()}\n\n` + context;
  if (params.extraText) context += `\n\nADDITIONAL CONTEXT:\n${params.extraText}`;
  context = normalizeIntake(context);

  // ── STEP 2: Company Profile ──
  await upd(2, LP_STEPS[1]);
  const coSys = "Return ONLY valid JSON — no prose, no markdown fences. Output must be parseable by JSON.parse().";
  const coRaw = await callAI(
    anthropicKey,
    `Analyze this company for B2B cold outreach.

${normUrl ? `WEBSITE URL: ${normUrl}\n` : ""}${normLinkedin ? `LINKEDIN: ${normLinkedin}\n` : ""}${params.offerings.trim() ? `USER-PROVIDED PRODUCTS & SERVICES (authoritative):\n${params.offerings.trim()}\n\n` : ""}${structureContext ? `DOM-EXTRACTED STRUCTURE (nav + headings from fetched pages):\n${structureContext.slice(0, 4000)}\n\n` : ""}SOURCES (body text): ${context}${salesBlock}

CRITICAL RULES:
- Every field MUST be filled. Never leave any field as empty string.
- co_name: use the brand name as shown on site / URL hostname.
- co_website: use the URL verbatim.
- co_industry: infer from offerings + page content.
- If not explicitly stated, make a confident best guess.

Return ONLY JSON:
{"fields":{"co_name":"","co_industry":"","co_website":"","co_size":"","co_revenue":"","co_pitch":"","co_we_help":"","co_who_struggle":"","co_by_providing":"","co_unlike":"","co_we_uniquely":"","co_core_problem":"","co_product":"","co_prod_breakdown":"","co_category":"","co_competitors":"","co_buying_motion":"","co_trust_risks":"","co_ksp":"","co_diff":"","co_proof":"","co_customers":"","co_dream":"","co_deal":"","co_cycle":"","co_exclude":"","co_avoid":""},
"confidence":{"co_name":0,"co_industry":0,"co_website":0,"co_pitch":0,"co_we_help":0,"co_ksp":0,"co_diff":0,"co_proof":0}}

co_ksp: key selling points that make the product stand out
co_diff: differentiators vs competitors
co_proof: proof points, metrics, case studies
co_prod_breakdown: per-product buyer, pains, gains, triggers, objections
Raw JSON only.`,
    coSys,
    5000,
  );
  let coFields: any = {};
  try {
    const p = JSON.parse((coRaw || "").replace(/```json?\s*/gi, "").replace(/```/g, "").trim());
    coFields = p.fields ?? {};
    for (const [k, v] of Object.entries(coFields)) {
      if (typeof v === "string") coFields[k] = normalizeIntake(v);
    }
  } catch {
    coFields = { co_name: normUrl ? new URL(normUrl).hostname.replace(/^www\./, "") : "Unknown", co_website: normUrl };
  }

  // ── STEP 3: Research Brief ──
  await upd(3, LP_STEPS[2]);
  let brief: any = { products: [], personas: [], matrix: [] };
  try {
    const briefRaw = await callAI(
      anthropicKey,
      `You are a senior B2B GTM strategist. Analyze this company and produce a comprehensive research brief.

COMPANY: ${JSON.stringify(coFields)}
${salesBlock}
${structureContext ? `DOM-EXTRACTED STRUCTURE (authoritative for product taxonomy):\n${structureContext.slice(0, 8000)}\n──────────────────────────────────\n\n` : ""}SOURCES (${context.length} chars — body text):
${context.slice(0, 30000)}

CRITICAL GROUNDING RULES:
- ONLY identify offerings explicitly named in the SOURCES. Do not infer from industry norms.
- Use exact names from the site — no renaming or generalizing.
- The DOM-EXTRACTED STRUCTURE is authoritative for product taxonomy.
- Only include personas that represent DISTINCT buyer segments with different pains/motivations.

${NAMING_RULES.product}
${NAMING_RULES.persona}

For each PRODUCT include: name, description, reasoning, dealSize, category, sourceUrl.
For each PERSONA include: name, buyerTitles, industries, primaryPain, reasoning.
For the MATRIX: for each product×persona combo include priority (high/medium/low/skip) and brief rationale.

Return ONLY valid JSON:
{"products":[{"name":"","description":"","reasoning":"","dealSize":"","category":"","sourceUrl":""}],"personas":[{"name":"","buyerTitles":"","industries":"","primaryPain":"","reasoning":""}],"matrix":[{"productIdx":0,"personaIdx":0,"priority":"high","rationale":""}]}`,
      "Return only valid JSON. Be thorough and specific.",
      12000,
    );
    brief = JSON.parse(briefRaw.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
  } catch (e) {
    console.error("Research brief failed:", e);
  }

  // ── STEP 4: Product Profiles (sequential, lean prompt, no retries) ──
  await upd(4, LP_STEPS[3]);
  const selProds = (brief.products || []).map((_: any, i: number) => i);
  const newProducts: any[] = [];
  for (const i of selProds) {
    const p = brief.products[i];
    let result: any = null;
    try {
      const prodRaw = await callAI(
        anthropicKey,
        `Product profile for "${p.name}" — ${coFields.co_name || ""} (${coFields.co_industry || ""}).\nDescription: ${p.description || ""}\nDeal size: ${p.dealSize || ""}\n\nReturn ONLY compact JSON (no nulls, no empty strings):\n{"name":"","description":"","category":"Software|Platform|Service|Hardware|Consulting|Other","useCases":"","keyFeatures":"","problemsSolved":"","valueProposition":"","idealCustomer":"","competitors":"","dealType":"Recurring|One-Time|Both","avgDealSize":"","elevatorPitch":"","messagingDos":"","messagingDonts":""}`,
        "Return only valid JSON. Be specific and concise.",
        1500,
        1,
      );
      const parsed = JSON.parse(prodRaw.replace(/```json|```/g, "").trim());
      result = { ...EMPTY_PRODUCT(), ...Object.fromEntries(Object.entries(parsed).filter(([, v]) => v && String(v).trim())), sourceUrl: p.sourceUrl || "" };
    } catch {
      result = { ...EMPTY_PRODUCT(), name: p.name || "", description: p.description || "", category: p.category || "Other", sourceUrl: p.sourceUrl || "" };
    }
    if (result?.name) newProducts.push(result);
    await upd(4, `${LP_STEPS[3]} (${newProducts.length}/${selProds.length})`);
  }

  // ── STEP 5: Persona Profiles (sequential, lean prompt, no retries) ──
  await upd(5, LP_STEPS[4]);
  const selPers = (brief.personas || []).map((_: any, i: number) => i);
  const allBriefPersonas = selPers.map((i: number) => brief.personas[i]);
  const personaDedup = allBriefPersonas.map((pe: any) => `${pe.name}: ${pe.buyerTitles || ""}, pain=${pe.primaryPain || ""}`).join("\n");
  const briefMatrix: any[] = Array.isArray(brief?.matrix) ? brief.matrix : [];
  const productIdByBriefIdx: Record<number, string> = {};
  selProds.forEach((brIdx: number, k: number) => { productIdByBriefIdx[brIdx] = newProducts[k]?.id || ""; });
  const buildFitMaps = (personaBriefIdx: number) => {
    const fit: Record<string, string> = {};
    const reason: Record<string, string> = {};
    for (const m of briefMatrix) {
      if (m?.personaIdx !== personaBriefIdx) continue;
      const prodId = productIdByBriefIdx[m.productIdx];
      if (!prodId) continue;
      fit[prodId] = String(m.priority || "").toLowerCase();
      if (m.rationale) reason[prodId] = String(m.rationale);
    }
    return { fit, reason };
  };
  const newPersonas: any[] = [];
  for (const [idx, pe] of allBriefPersonas.entries()) {
    let parsed: any = null;
    try {
      const raw = await callAI(
        anthropicKey,
        `B2B persona for "${pe.name}" (${pe.buyerTitles || ""}) — selling ${coFields.co_name || ""} to ${pe.industries || ""}.\nPrimary pain: ${pe.primaryPain || ""}\nOther personas: ${personaDedup}\n\nReturn ONLY compact JSON:\n{"name":"","fields":{"industries":"","co_sizes":["SMB 1-50","Mid-Market 51-500"],"geo":"","buyer":"","champ":"","goals":"","fears":"","pain1":"","pain2":"","objections":"","tone":"Consultative & Educational|Direct & Punchy|Casual & Conversational|Formal & Executive|Data-driven & Analytical|Blue Collar & Human|Blunt & Edgy|Confrontational","hook":"","cta":"15-min call ask|Soft permission ('worth a chat?')|Video/resource share|Direct demo ask|Open-ended question|Easy yes/no reply|Direct callback ask","best_channel":"","seq_strategy":"","why_client_wins":""},"confidence":{}}`,
        "Return only valid JSON. Be specific and concise.",
        1500,
        1,
      );
      parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      parsed = null;
    }
    if (parsed) {
      const persona = newICP(idx, parsed.fields || {}, parsed.name || pe.name, parsed.confidence || {});
      persona.linkedProductIds = newProducts.map((p: any) => p.id);
      const { fit, reason } = buildFitMaps(idx);
      persona.linkedProductFit = fit;
      persona.linkedProductFitReason = reason;
      newPersonas.push(persona);
    } else {
      const fallback = newICP(idx, { industries: pe.industries, buyer: pe.buyerTitles, pain1: pe.primaryPain }, pe.name, {});
      const { fit, reason } = buildFitMaps(idx);
      fallback.linkedProductFit = fit;
      fallback.linkedProductFitReason = reason;
      newPersonas.push(fallback);
    }
    await upd(5, `${LP_STEPS[4]} (${newPersonas.length}/${allBriefPersonas.length})`);
  }

  // ── STEP 6: Intelligence & Offers ──
  await upd(6, LP_STEPS[5]);
  const combos = newProducts.flatMap((p: any) => newPersonas.map((pe: any) => ({
    prodName: p.name, prodId: p.id, persName: pe.name, persId: pe.id,
    pain: pe.data?.pain1 || "", buyer: pe.data?.buyer || "",
  })));
  const [offersResult, intelResult, guardrailsResult] = await Promise.all([
    Promise.allSettled(combos.map(async (combo: any) => {
      try {
        const prod = newProducts.find((p: any) => p.id === combo.prodId);
        const offerRaw = await callAI(
          anthropicKey,
          `Generate 3 offer tiers (soft/medium/hard) for: ${combo.prodName} × ${combo.persName}.\nCompany: ${coFields.co_name || ""}\nProduct: ${prod?.description || ""}\nPersona pain: ${combo.pain || ""}\nReturn ONLY JSON array: [{"tier":"soft","name":"","ctaText":"","whatTheyGet":"","frictionReduction":""},...]`,
          "",
          600,
        );
        const parsed = JSON.parse(offerRaw.replace(/```json|```/g, "").trim());
        if (Array.isArray(parsed)) return parsed.map((o: any) => ({ ...EMPTY_OFFER(combo.prodId, o.tier || "soft", combo.persId, "cold_outreach"), name: o.name || "", ctaText: o.ctaText || "", whatTheyGet: o.whatTheyGet || "", frictionReduction: o.frictionReduction || "" }));
        return [];
      } catch { return []; }
    })),
    (async () => {
      try {
        const intelRaw = await callAI(
          anthropicKey,
          `Generate competitive intelligence and per-combo sales playbooks.\n\nCOMPANY: ${coFields.co_name || ""} (${coFields.co_industry || ""})\nVALUE PROP: ${coFields.co_pitch || ""}\nCOMPETITORS: ${coFields.co_competitors || ""}\nCOMBOS:\n${combos.map((c: any, i: number) => `${i}: ${c.prodName} × ${c.persName} (buyer: ${c.buyer}, pain: ${c.pain})`).join("\n")}\n\nReturn ONLY valid JSON:\n{"battlecards":[{"competitorName":"","overview":"","strengths":"","weaknesses":"","pricing":"","landmines":"","displacementAngles":""}],"playbooks":[{"comboIndex":0,"discoveryQuestions":"","demoTalkingPoints":"","objections":[{"objection":"","category":"pricing","severity":"common","rebuttal":""}]}]}\n\nbattlecards 2-4, playbooks ONE per combo (${combos.length}).`,
          "",
          5000,
        );
        return JSON.parse(intelRaw.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
      } catch { return null; }
    })(),
    (async () => {
      try {
        const gRaw = await callAI(
          anthropicKey,
          `Set messaging guardrails for cold outreach.\nCompany: ${coFields.co_name || ""}\nProducts: ${newProducts.map((p: any) => p.name).join(", ")}\nPersonas: ${newPersonas.map((p: any) => p.name).join(", ")}\nCompetitors: ${coFields.co_competitors || ""}\nReturn ONLY JSON: {"co_exclude":"domains/companies to never contact","co_avoid":"phrases to avoid"}`,
          "",
          400,
        );
        return JSON.parse(gRaw.replace(/```json|```/g, "").trim());
      } catch { return null; }
    })(),
  ]);
  const newOffers: any[] = [];
  for (const r of offersResult) { if (r.status === "fulfilled" && Array.isArray(r.value)) newOffers.push(...r.value); }
  const intel = intelResult as any;
  if (guardrailsResult) {
    coFields = { ...coFields, ...(guardrailsResult as any) };
  }

  // ── STEP 7: Domains (generate only — no live availability check) ──
  await upd(7, LP_STEPS[6]);
  const coName2 = (coFields.co_name || "company").toLowerCase();
  const hostname2 = (normUrl || "").replace(/https?:\/\//i, "").replace(/\/.*/, "").replace(/^www\./, "").toLowerCase();
  const hostParts = hostname2.split(".");
  const fwdStem2 = (hostParts.length >= 2 ? hostParts[hostParts.length - 2] : hostParts[0] || "").replace(/[^a-z0-9]/g, "");
  const stopW = new Set(["the","and","for","inc","llc","ltd","corp","group","company","services","solutions","consulting"]);
  const nameW = coName2.split(/[\s,.\-&]+/).filter((w: string) => w.length >= 2 && !stopW.has(w));
  const nameJ = nameW.join("");
  const brand = fwdStem2 && fwdStem2.length >= 3 && fwdStem2.length <= 18 ? fwdStem2 : nameJ.length <= 18 ? nameJ : nameW[0] || "company";
  const prefs = ["get","try","go","my","meet","join","use","run","hello","ask","all","top","best","fast","new","pro","we","by","hey","with","hi"];
  const suffs = ["hq","app","team","co","hub","labs","pro","now","up","biz","mail","digital","online","direct","global","works","cloud","send","reach","zone","base","desk","box","line","edge","plus","one","center","corp","studio","agency","web","first","core","flow","link","key","ace","net","io"];
  const dc = new Set<string>();
  for (const p of prefs) { const s = p + brand; if (s.length >= 5 && s.length <= 22) { dc.add(s); dc.add(p + "-" + brand); } }
  for (const s of suffs) { const d = brand + s; if (d.length >= 5 && d.length <= 22) { dc.add(d); dc.add(brand + "-" + s); } }
  dc.add(brand);
  let allDC = [...dc].filter(d => d.length >= 5 && d.length <= 26);
  // shuffle
  for (let i = allDC.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [allDC[i], allDC[j]] = [allDC[j], allDC[i]]; }
  const finalDomains: { domain: string; tld: string; full: string }[] = [];
  for (const stem of allDC) {
    if (finalDomains.length >= 67) break;
    finalDomains.push({ domain: stem, tld: ".com", full: stem + ".com" });
  }
  if (finalDomains.length < 67) {
    try {
      const prodNames = newProducts.slice(0, 5).map((p: any) => p.name).filter(Boolean).join(", ");
      const personaNames = newPersonas.slice(0, 5).map((p: any) => p.name).filter(Boolean).join(", ");
      const valueProp = coFields.co_value_prop || coFields.co_tagline || "";
      const aiDR = await callAI(
        anthropicKey,
        `Generate ${(67 - finalDomains.length) * 4} creative cold-email domain stems for "${coFields.co_name}" (${coFields.co_industry}).
Brand word: "${brand}". Every stem MUST contain the brand word.
Products/services: ${prodNames || "n/a"}
Value prop: ${valueProp || "n/a"}
Target personas: ${personaNames || "n/a"}
Use this context so stems feel relevant — but brand word must appear in every stem.
Stems only — no TLD. Already used: ${finalDomains.map((d: any) => d.domain).slice(0, 40).join(",")}.
Return ONLY JSON array of stems: ["name1","name2",...]`,
        "",
        1000,
      );
      const aiD: string[] = JSON.parse(aiDR.replace(/```json|```/g, "").trim());
      for (const stem of aiD) {
        if (finalDomains.length >= 67) break;
        const cl = stem.toLowerCase().replace(/[^a-z0-9-]/g, "");
        if (cl.length >= 5 && cl.length <= 26 && !finalDomains.some((d: any) => d.domain === cl))
          finalDomains.push({ domain: cl, tld: ".com", full: cl + ".com" });
      }
    } catch { /* non-fatal */ }
  }

  // Persist partial result (domains ready) after step 7
  await writeProgress(supabase, jobKey, {
    partialResult: { company: coFields, products: newProducts, personas: newPersonas, domains: finalDomains, campaignGroups: [] },
  });

  // ── STEPS 8+9: Campaign Strategies + Sequences ──
  await upd(8, LP_STEPS[7]);
  const priorityOrder = ["high", "medium", "low"];
  const matrixCombos: { product: any; persona: any; priority: string; rationale: string }[] = [];
  for (const pri of priorityOrder) {
    if (matrixCombos.length >= 5) break;
    for (const m of briefMatrix) {
      if (matrixCombos.length >= 5) break;
      if ((m.priority || "").toLowerCase() !== pri) continue;
      if ((m.priority || "").toLowerCase() === "skip") continue;
      const prod = newProducts[selProds.indexOf(m.productIdx)];
      const pers = newPersonas[m.personaIdx] || newPersonas[0];
      if (!prod || !pers) continue;
      if (matrixCombos.some(c => c.product.id === prod.id && c.persona.id === pers.id)) continue;
      matrixCombos.push({ product: prod, persona: pers, priority: m.priority || "medium", rationale: m.rationale || "" });
    }
  }
  if (matrixCombos.length === 0) {
    for (const prod of newProducts.slice(0, 5)) {
      if (matrixCombos.length >= 5) break;
      const persona = newPersonas[matrixCombos.length % Math.max(newPersonas.length, 1)] || newPersonas[0];
      if (!persona) break;
      matrixCombos.push({ product: prod, persona, priority: "medium", rationale: "" });
    }
  }

  const pb = PLAYBOOKS[params.playbookKey] || PLAYBOOKS.auto;
  const pbBlock = pb.key === "auto" ? "" : `\nVOICE & STRATEGY PROFILE — ${pb.label} (write like ${pb.figure}):\n- Style: ${(pb.voice || []).join(" | ")}\n- Strategy: ${pb.strategy || ""}\n- Opening: ${pb.opening || ""}\n- Proof: ${pb.proof || ""}\n- CTA: ${pb.cta || ""}\n- Avoid: ${pb.avoid || ""}\nStay in this voice throughout.\n`;

  const allNewCampaigns: any[] = [];
  const lpGroups: any[] = [];

  for (let gi = 0; gi < matrixCombos.length; gi++) {
    const { product, persona, priority, rationale } = matrixCombos[gi];
    const pd = persona?.data || {};
    const ctx = {
      company: coFields,
      icp: { ...pd, name: persona?.name },
      product: { name: product.name, description: product.description, valueProposition: product.valueProposition, keyFeatures: product.keyFeatures, problemsSolved: product.problemsSolved, elevatorPitch: product.elevatorPitch },
    };
    const ctxStr = JSON.stringify(ctx).slice(0, 4000);

    await upd(8, `Campaign ${gi + 1}/${matrixCombos.length}: strategies...`);

    // Email + LinkedIn strategies in parallel
    const [emailStrategy, linkedinStrategy] = await Promise.all([
      callAI(
        anthropicKey,
        `Generate a campaign strategy brief for EMAIL cold outreach.
Context: ${ctxStr}
${rationale ? `Matrix note: ${rationale}` : ""}${pbBlock}${salesBlock}
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

HARD RULE: No links or URLs anywhere in the email sequence. All CTAs must be reply-based only.`,
        "",
        800,
      ),
      callAI(
        anthropicKey,
        `Generate a campaign strategy brief for LINKEDIN outreach.
Context: ${ctxStr}
${pb.key !== "auto" ? `LinkedIn voice: ${pb.linkedin || pbBlock}` : ""}${salesBlock}
Write a focused LinkedIn strategy. Cover:

**CONNECTION ANGLE** (why connect — must feel personal, no pitch)

**OPENER HOOK** (pain-first message 1 angle)

**5-TOUCH MESSAGE ARC**
Touch 1 (Day 0 — connection): [angle]
Touch 2 (Day 2): [angle]
Touch 3 (Day 5): [angle]
Touch 4 (Day 10): [angle]
Touch 5 (Day 17 — breakup): [angle]

**CTA APPROACH** (ultra-low-friction — what we ask for)

**PERSONALIZATION SIGNALS** (what to look for in their LinkedIn profile)`,
        "",
        700,
      ),
    ]);

    await upd(9, `Campaign ${gi + 1}/${matrixCombos.length}: sequences...`);

    // Email + LinkedIn sequences in parallel
    const [emailSeqRaw, liSeqRaw] = await Promise.all([
      callAI(
        anthropicKey,
        `Write a 5-email cold outreach sequence. Real emails, not templates. Max 100 words each body.

Context: ${ctxStr}
${pbBlock}${salesBlock}
EMAIL STRATEGY (follow this exactly — angles, arc, and personalization):
${emailStrategy.slice(0, 1200)}

Rules:
- Email 1 (Day 0): lead with the LEAD PAIN — hook, short, personal
- Email 2 (Day 3): different angle + trigger event
- Email 3 (Day 7): proof/social proof + objection addressed
- Email 4 (Day 14): gain angle
- Email 5 (Day 21): breakup — direct, human, low-friction
- ZERO links or URLs in any email. CTAs must be reply-based only.

Return ONLY valid JSON:
{"steps":[{"stepNumber":1,"role":"hook","dayOffset":0,"subject":"...","body":"..."},{"stepNumber":2,"role":"proof","dayOffset":3,"subject":"...","body":"..."},{"stepNumber":3,"role":"value","dayOffset":7,"subject":"...","body":"..."},{"stepNumber":4,"role":"urgency","dayOffset":14,"subject":"...","body":"..."},{"stepNumber":5,"role":"breakup","dayOffset":21,"subject":"...","body":"..."}]}`,
        "",
        1400,
      ),
      callAI(
        anthropicKey,
        `Write a 5-touch LinkedIn outreach sequence. Max 300 chars for connection request, 500 chars for messages.

Context: ${ctxStr}
${pb.key !== "auto" ? `LinkedIn voice: ${pb.linkedin || ""}` : ""}${salesBlock}
LINKEDIN STRATEGY:
${linkedinStrategy.slice(0, 1000)}

Rules:
- Touch 1 (Day 0): connection request only — personal reason to connect, NO pitch
- Touch 2-5: conversational DMs, same pain angles from strategy adapted for LinkedIn format
- CTAs ultra-low-friction (yes/no reply, quick question)

Return ONLY valid JSON:
{"steps":[{"stepNumber":1,"role":"connection","dayOffset":0,"body":"connection request text"},{"stepNumber":2,"role":"follow_up","dayOffset":2,"body":"message"},{"stepNumber":3,"role":"value","dayOffset":5,"body":"message"},{"stepNumber":4,"role":"proof","dayOffset":10,"body":"message"},{"stepNumber":5,"role":"breakup","dayOffset":17,"body":"message"}]}`,
        "",
        900,
      ),
    ]);

    let emailSeq: any[] = [];
    try {
      const ep = JSON.parse(emailSeqRaw.replace(/```json|```/g, "").trim());
      emailSeq = (ep.steps || []).map((s: any, i: number) => ({
        id: uid(), stepNumber: s.stepNumber || i + 1, role: s.role || "hook",
        dayOffset: s.dayOffset ?? [0, 3, 7, 14, 21][i] ?? i * 7,
        subject: s.subject || "", body: s.body || "", variants: [],
      }));
    } catch { /* non-fatal */ }

    let liSeq: any[] = [];
    try {
      const lp2 = JSON.parse(liSeqRaw.replace(/```json|```/g, "").trim());
      liSeq = (lp2.steps || []).map((s: any, i: number) => ({
        id: uid(), stepNumber: s.stepNumber || i + 1, role: s.role || "follow_up",
        dayOffset: s.dayOffset ?? [0, 2, 5, 10, 17][i] ?? i * 3,
        subject: "", body: s.body || "", variants: [],
      }));
    } catch { /* non-fatal */ }

    const ec: any = EMPTY_CAMPAIGN();
    ec.channel = "email"; ec.type = "cold_email";
    ec.productId = product.id; ec.personaIds = [persona.id];
    ec.name = `${persona.name} × ${product.name} — Email`;
    ec.source = "quickstart"; ec.playbook = params.playbookKey;
    ec.targeting = { titles: pd.buyer || "", industries: pd.industries || "", companySizes: Array.isArray(pd.co_sizes) ? pd.co_sizes.join(", ") : (pd.co_sizes || ""), personLocation: pd.geo || "", companyLocation: pd.geo || "", keywords: pd.keywords || "", intentTopics: pd.intent_topics || "", excludedDomains: pd.neg || "" };
    ec.sequence = emailSeq;

    const lc: any = EMPTY_CAMPAIGN();
    lc.channel = "linkedin"; lc.type = "linkedin_message";
    lc.productId = product.id; lc.personaIds = [persona.id];
    lc.name = `${persona.name} × ${product.name} — LinkedIn`;
    lc.source = "quickstart"; lc.playbook = params.playbookKey; lc.targeting = { ...ec.targeting };
    lc.sequence = liSeq;

    allNewCampaigns.push(ec, lc);
    lpGroups.push({
      id: uid(), productId: product.id, personaId: persona.id,
      productName: product.name, personaName: persona.name,
      priority, rationale,
      emailCampaignId: ec.id, linkedinCampaignId: lc.id,
      emailStrategy, linkedinStrategy,
      emailSequence: emailSeq, linkedinSequence: liSeq,
    });
  }

  // Strategy (North Star)
  let strategy: any = null;
  try {
    const stratRaw = await callAI(
      anthropicKey,
      `Generate a North Star strategy for this company.
Company: ${JSON.stringify(coFields)}
Products: ${newProducts.map((p: any) => p.name).join(", ")}
Personas: ${newPersonas.map((p: any) => p.name).join(", ")}
Return ONLY valid JSON:
{"northStar":{"icp":"1-sentence ICP definition","corePain":"primary pain we solve","primaryChannel":"Email + LinkedIn","channelReason":"why","goal90Days":"90-day measurable goal"},"bets":[{"hypothesis":"We believe [persona] will respond to [angle] through [channel] because [reason]","channel":"Email","personaRef":"persona name","angle":"messaging angle","status":"proving"}]}`,
      "",
      600,
    );
    const sd = JSON.parse(stratRaw.replace(/```json|```/g, "").trim());
    strategy = {
      northStar: { ...(sd.northStar || {}), updatedAt: new Date().toISOString() },
      bets: (sd.bets || []).map((b: any) => ({ ...b, id: uid(), createdAt: new Date().toISOString(), evidence: "", campaignIds: [] })),
      insights: [], history: [], phases: [],
    };
  } catch { /* non-fatal */ }

  return {
    company: coFields,
    products: newProducts,
    personas: newPersonas,
    domains: finalDomains,
    campaignGroups: lpGroups,
    campaigns: allNewCampaigns,
    offers: newOffers,
    battlecards: intel?.battlecards || [],
    playbooks: intel?.playbooks || [],
    strategy,
  };
}

// ─── Slack notification ───────────────────────────────────────────────────────

async function sendSlackNotification(
  slackToken: string,
  userEmail: string,
  companyName: string,
  appUrl: string,
) {
  try {
    // Look up Slack user ID by email
    let slackUserId = "";
    if (userEmail) {
      const lookupRes = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(userEmail)}`, {
        headers: { Authorization: `Bearer ${slackToken}` },
      });
      const lookup = await lookupRes.json();
      slackUserId = lookup.user?.id || "";
    }

    if (!slackUserId) {
      console.warn("Slack: could not resolve user ID from email, skipping notification");
      return;
    }

    // Open DM channel with the user
    const dmRes = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: { Authorization: `Bearer ${slackToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ users: slackUserId }),
    });
    const dm = await dmRes.json();
    const channelId = dm.channel?.id;
    if (!channelId) {
      console.error("Slack: could not open DM channel", dm.error);
      return;
    }

    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${slackToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: channelId,
        text: `✅ *LaunchPad complete for ${companyName}!*\n\nResearch, 67 domains, and campaigns with email + LinkedIn sequences are ready.\n\n👉 ${appUrl}`,
        unfurl_links: false,
      }),
    });
  } catch (e) {
    console.error("Slack notification failed:", e);
  }
}

// ─── Edge function handler ────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-anthropic-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      workspaceId,
      params,
      appUrl = "",
      slackToken = "",
      userEmail = "",
    } = body;

    if (!workspaceId || !params?.url) {
      return new Response(JSON.stringify({ error: "workspaceId and params.url are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const jobId = uid();
    const jobKey = `lp_job_${workspaceId}`;

    // Write initial job state
    await supabase.from("app_data").upsert(
      { key: jobKey, value: JSON.stringify({ jobId, status: "running", step: 0, phase: "Starting...", startedAt: new Date().toISOString() }) },
      { onConflict: "key" },
    );

    // Run pipeline in background (responds immediately, completes after response)
    // @ts-ignore — EdgeRuntime is available in Supabase Deno runtime
    EdgeRuntime.waitUntil((async () => {
      try {
        const result = await runPipeline(params, anthropicKey, supabase, jobKey);

        // Save completed job with full result
        await supabase.from("app_data").upsert(
          { key: jobKey, value: JSON.stringify({ jobId, status: "done", step: LP_STEPS.length, phase: "Complete", completedAt: new Date().toISOString(), result }) },
          { onConflict: "key" },
        );

        // Also merge LP result into the workspace record so the client can reload it
        try {
          const { data: wsData } = await supabase.from("app_data").select("value").eq("key", `ws_${workspaceId}`).single();
          if (wsData?.value) {
            const ws = JSON.parse(wsData.value as string);
            const merged = {
              ...ws,
              companyData: { ...ws.companyData, ...result.company },
              products: [...(ws.products || []), ...result.products],
              icps: [...(ws.icps || []), ...result.personas],
              campaigns: [...(ws.campaigns || []), ...result.campaigns],
              offers: [...(ws.offers || []), ...result.offers],
              battlecards: [...(ws.battlecards || []), ...result.battlecards],
              strategy: result.strategy || ws.strategy,
              _lpResult: { company: result.company, products: result.products, personas: result.personas, domains: result.domains, campaignGroups: result.campaignGroups },
            };
            await supabase.from("app_data").upsert({ key: `ws_${workspaceId}`, value: JSON.stringify(merged) }, { onConflict: "key" });
          }
        } catch (e) {
          console.error("Failed to merge into workspace:", e);
        }

        // Send Slack DM
        if (slackToken && userEmail) {
          await sendSlackNotification(slackToken, userEmail, result.company?.co_name || "your client", appUrl || "the app");
        }
      } catch (err) {
        console.error("Pipeline failed:", err);
        await supabase.from("app_data").upsert(
          { key: jobKey, value: JSON.stringify({ jobId, status: "error", error: String(err), completedAt: new Date().toISOString() }) },
          { onConflict: "key" },
        );
      }
    })());

    return new Response(JSON.stringify({ jobId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
