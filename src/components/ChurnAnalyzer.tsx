import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { SUPABASE_URL, SUPABASE_KEY, dbGet, dbPut } from "../lib/supabase";

const MAPPINGS_KEY = "churn_domain_mappings";

const C = {
  bg: "#F8F9FE", canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7",
  borderHi: "#D8DEE9", text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentBorder: "#6C5CE733",
  green: "#00D68F", greenLo: "#00D68F12", greenBorder: "#00D68F33",
  amber: "#FFC048", amberLo: "#FFC04812", amberBorder: "#FFC04833",
  red: "#FF6B6B", redLo: "#FF6B6B12", redBorder: "#FF6B6B33",
  blue: "#54A0FF", blueLo: "#54A0FF12",
};
const head = "'Inter', system-ui, sans-serif";
const body = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

// ── HubSpot proxy helper (same pattern as Stage1_Handoff) ────────────────────
const SUPABASE_ANON_KEY = SUPABASE_KEY;

async function hsCall(path: string, method: "GET" | "POST" = "GET", body?: any): Promise<any> {
  const token = (() => { try { return localStorage.getItem("b2br_hubspot_token") || ""; } catch { return ""; } })();
  if (!token) return { error: "No HubSpot token" };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/hubspot-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "x-hubspot-token": token,
      },
      body: JSON.stringify({ path, method, body }),
    });
    return await res.json();
  } catch (e: any) {
    return { error: e.message };
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

type Phase = "input" | "lookup" | "review" | "fetching" | "analyzing" | "results";

interface CompanyRow {
  inputDomain: string;
  status: "found" | "not_found" | "error";
  companyId?: string;
  companyName?: string;
  domain?: string;
  website?: string;
  industry?: string;
  employees?: string;
  revenue?: string;
  emailCount: number;
  notesCount: number;
  activityText?: string;
  included: boolean;
  result?: ChurnResult;
  analyzeStatus?: "pending" | "done" | "error";
  analyzedAt?: string;
  fromCache?: boolean;
}

interface ChurnResult {
  churnReason: string;
  churnReasonDetail: string;
  churnProofPoints: string[];
  // Dimension 1: ROI Fit
  aov: "PASS" | "FAIL" | "UNSURE";
  aovReason: string;
  salesCycle: "PASS" | "FAIL" | "UNSURE";
  salesCycleReason: string;
  recurringRevenue: "PRESENT" | "ABSENT" | "UNSURE";
  recurringRevenueReason: string;
  grossMargin: "high" | "medium" | "low";
  grossMarginReason: string;
  roiFit: "PASS" | "FAIL" | "UNSURE";
  roiFitReason: string;
  // Dimension 2: Sales Capacity
  salesCapacity: "PASS" | "FAIL" | "UNSURE";
  salesCapacityReason: string;
  // Dimension 3: Audience Clarity
  audienceClarity: "PASS" | "FAIL" | "UNSURE";
  audienceClarityReason: string;
  fitScore: "Likely Fit" | "Needs Review" | "Disqualified";
  overallVerdict: string;
  recommendation: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pfu(v: string) {
  // PASS/FAIL/UNSURE color
  if (v === "PASS") return { bg: C.greenLo, border: C.greenBorder, text: C.green };
  if (v === "FAIL") return { bg: C.redLo, border: C.redBorder, text: C.red };
  return { bg: C.amberLo, border: C.amberBorder, text: C.amber };
}

function fitColor(score: string) {
  if (score === "Likely Fit") return { bg: C.greenLo, border: C.greenBorder, text: C.green };
  if (score === "Needs Review") return { bg: C.amberLo, border: C.amberBorder, text: C.amber };
  return { bg: C.redLo, border: C.redBorder, text: C.red };
}

function rrColor(v: string) {
  if (v === "PRESENT") return { bg: C.greenLo, border: C.greenBorder, text: C.green };
  if (v === "ABSENT") return { bg: C.surface, border: C.border, text: C.textSoft };
  return { bg: C.amberLo, border: C.amberBorder, text: C.amber };
}

function marginColor(v: string) {
  if (v === "high") return { bg: C.greenLo, border: C.greenBorder, text: C.green };
  if (v === "medium") return { bg: C.amberLo, border: C.amberBorder, text: C.amber };
  return { bg: C.redLo, border: C.redBorder, text: C.red };
}

function Badge({ label, color }: { label: string; color: { bg: string; border: string; text: string } }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 5,
      background: color.bg, border: `1px solid ${color.border}`,
      fontSize: 10, fontWeight: 800, color: color.text, fontFamily: mono,
      letterSpacing: 0.6, textTransform: "uppercase",
    }}>{label}</span>
  );
}

// ── Activity fetcher ─────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchActivityText(companyId: string, contactIds: string[]): Promise<{ text: string; emailCount: number; notesCount: number }> {
  // Fetch company-level associations sequentially to stay within HubSpot rate limits
  const companyEmailsAssoc = await hsCall(`/crm/v3/objects/companies/${companyId}/associations/emails`);
  const notesAssoc = await hsCall(`/crm/v3/objects/companies/${companyId}/associations/notes`);
  const callsAssoc = await hsCall(`/crm/v3/objects/companies/${companyId}/associations/calls`);

  // Contact-level email associations (in parallel — they're separate contacts)
  const contactEmailAssocs = await Promise.all(
    contactIds.slice(0, 8).map((id: string) => hsCall(`/crm/v3/objects/contacts/${id}/associations/emails`))
  );

  const ids = (res: any) => (res?.results || []).map((r: any) => String(r.id || r.toObjectId || "")).filter(Boolean);

  const companyEmailIds = ids(companyEmailsAssoc);
  const contactEmailIds = (contactEmailAssocs as any[]).flatMap(ids);
  const allEmailIds = [...new Set([...companyEmailIds, ...contactEmailIds])].slice(0, 100);
  const noteIds = ids(notesAssoc).slice(0, 60);
  const callIds = ids(callsAssoc).slice(0, 30);

  console.log(`[churn] ${companyId}: ${allEmailIds.length} emails, ${noteIds.length} notes, ${callIds.length} calls`);

  const [notesRes, emailsRes, callsRes] = await Promise.all([
    noteIds.length ? hsCall("/crm/v3/objects/notes/batch/read", "POST", {
      inputs: noteIds.map((id: string) => ({ id })),
      properties: ["hs_note_body", "hs_timestamp"],
    }) : Promise.resolve({ results: [] }),
    allEmailIds.length ? hsCall("/crm/v3/objects/emails/batch/read", "POST", {
      inputs: allEmailIds.map((id: string) => ({ id })),
      properties: ["hs_email_subject", "hs_email_text", "hs_email_html", "hs_timestamp", "hs_email_direction", "hs_email_from_email", "hs_email_to_email"],
    }) : Promise.resolve({ results: [] }),
    callIds.length ? hsCall("/crm/v3/objects/calls/batch/read", "POST", {
      inputs: callIds.map((id: string) => ({ id })),
      properties: ["hs_call_body", "hs_timestamp", "hs_call_direction"],
    }) : Promise.resolve({ results: [] }),
  ]);

  console.log(`[churn] ${companyId}: batch read returned ${(emailsRes?.results || []).length} emails, ${(notesRes?.results || []).length} notes`);

  const emails = (emailsRes?.results || []).map((e: any) => {
    const rawText = (e.properties?.hs_email_text || "").trim();
    const rawHtml = (e.properties?.hs_email_html || "").trim();
    const body = rawText || stripHtml(rawHtml);
    return {
      type: "email",
      date: e.properties?.hs_timestamp || "",
      subject: e.properties?.hs_email_subject || "",
      direction: e.properties?.hs_email_direction || "",
      from: e.properties?.hs_email_from_email || "",
      to: e.properties?.hs_email_to_email || "",
      body: body.slice(0, 2500),
    };
  });

  const notes = (notesRes?.results || []).map((n: any) => ({
    type: "note",
    date: n.properties?.hs_timestamp || "",
    subject: "",
    body: (n.properties?.hs_note_body || "").slice(0, 1500),
  }));

  const calls = (callsRes?.results || []).map((c: any) => ({
    type: "call",
    date: c.properties?.hs_timestamp || "",
    subject: "",
    direction: c.properties?.hs_call_direction || "",
    body: (c.properties?.hs_call_body || "").slice(0, 1000),
  }));

  // Include ALL activity — even emails with no body (subject line alone is useful context)
  const all = [...emails, ...notes, ...calls]
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

  const text = all.map(a => {
    const dt = a.date ? new Date(a.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "unknown date";
    if (a.type === "email") {
      const dir = (a as any).direction === "INCOMING_EMAIL" ? "(from client)" : "(outbound)";
      const lines = [`[EMAIL ${dt} ${dir}]`];
      if ((a as any).from || (a as any).to) lines.push(`From: ${(a as any).from || "?"} → ${(a as any).to || "?"}`);
      if (a.subject) lines.push(`Subject: ${a.subject}`);
      lines.push(a.body || "(no body text)");
      return lines.join("\n");
    }
    if (a.type === "call") {
      return `[CALL ${dt}${(a as any).direction ? ` ${(a as any).direction}` : ""}]\n${a.body || "(no call notes)"}`;
    }
    return `[NOTE ${dt}]\n${a.body || "(empty note)"}`;
  }).join("\n\n---\n\n").slice(0, 24000);

  return { text, emailCount: emails.length, notesCount: notes.length };
}

// ── Manual search component (per not_found row) ──────────────────────────────

interface ManualSearchProps {
  inputDomain: string;
  onMatch: (inputDomain: string, company: { id: string; name: string; domain: string; website: string; industry: string; employees: string; revenue: string }) => void;
}

function ManualSearch({ inputDomain, onMatch }: ManualSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function doSearch(q: string) {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    const res = await hsCall("/crm/v3/objects/companies/search", "POST", {
      query: q,
      properties: ["name", "domain", "website", "industry", "numberofemployees", "annualrevenue"],
      limit: 8,
    });
    const basic = (res?.results || []).map((r: any) => ({ ...r, emailCount: null, notesCount: null }));
    setResults(basic);
    setOpen(true);
    setLoading(false);

    // Fetch email + note counts in parallel for all results
    if (basic.length > 0) {
      const withCounts = await Promise.all(basic.map(async (r: any) => {
        const [emailAssoc, notesAssoc] = await Promise.all([
          hsCall(`/crm/v3/objects/companies/${r.id}/associations/emails`),
          hsCall(`/crm/v3/objects/companies/${r.id}/associations/notes`),
        ]);
        return { ...r, emailCount: (emailAssoc?.results || []).length, notesCount: (notesAssoc?.results || []).length };
      }));
      setResults(withCounts);
    }
  }

  function updateDropPos() {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropPos({ top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 300) });
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    updateDropPos();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 350);
  }

  function handleFocus() {
    updateDropPos();
    if (results.length > 0) setOpen(true);
  }

  function handleSelect(r: any) {
    const p = r.properties || {};
    onMatch(inputDomain, {
      id: r.id,
      name: p.name || "",
      domain: p.domain || inputDomain,
      website: p.website || "",
      industry: p.industry || "",
      employees: p.numberofemployees || "",
      revenue: p.annualrevenue || "",
    });
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        const drop = document.getElementById(`drop-${inputDomain}`);
        if (!drop?.contains(e.target as Node)) setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [inputDomain]);

  const showDrop = open && (results.length > 0 || (query.length >= 2 && !loading));

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input
        ref={inputRef}
        value={query}
        onChange={handleChange}
        onFocus={handleFocus}
        placeholder="Search by name…"
        style={{
          padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.borderHi}`,
          fontSize: 12.5, fontFamily: body, color: C.text, background: C.canvas,
          outline: "none", width: 190, boxSizing: "border-box",
        }}
      />
      {loading && <div style={{ width: 12, height: 12, border: `2px solid ${C.accentBorder}`, borderTopColor: C.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />}

      {showDrop && createPortal(
        <div id={`drop-${inputDomain}`} style={{
          position: "fixed", top: dropPos.top, left: dropPos.left, width: dropPos.width,
          zIndex: 9999, background: "#FFFFFF", border: `1px solid ${C.borderHi}`,
          borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          maxHeight: 280, overflowY: "auto",
        }}>
          {results.length > 0 ? results.map((r: any) => {
            const p = r.properties || {};
            return (
              <div
                key={r.id}
                onMouseDown={() => handleSelect(r)}
                style={{
                  padding: "10px 16px", cursor: "pointer",
                  borderBottom: `1px solid ${C.border}`, background: "#FFFFFF",
                  transition: "background .1s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = C.accentLo)}
                onMouseLeave={e => (e.currentTarget.style.background = "#FFFFFF")}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, fontFamily: head }}>{p.name || "—"}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {r.emailCount === null
                      ? <div style={{ width: 10, height: 10, border: `2px solid ${C.accentBorder}`, borderTopColor: C.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                      : <>
                          <span style={{ fontSize: 11, fontFamily: mono, color: C.accent, fontWeight: 700 }}>{r.emailCount}e</span>
                          <span style={{ fontSize: 11, fontFamily: mono, color: C.textSoft }}>{r.notesCount}n</span>
                        </>
                    }
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: C.muted, fontFamily: mono, marginTop: 2 }}>
                  {[p.domain, p.industry].filter(Boolean).join(" · ")}
                </div>
              </div>
            );
          }) : (
            <div style={{ padding: "12px 16px", fontSize: 12.5, color: C.muted, fontFamily: mono }}>No companies found</div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

type SavedMapping = { companyId: string; companyName: string; domain: string; website: string; industry: string; employees: string; revenue: string };
type SavedMappings = Record<string, SavedMapping>;

const ROWS_CACHE_KEY = "churn_rows_cache";
const PHASE_CACHE_KEY = "churn_phase_cache";
const RESULT_CACHE_PREFIX = "churn_result_v1_";

function resultCacheKey(domain: string) { return RESULT_CACHE_PREFIX + domain; }

function loadCachedRows(): CompanyRow[] {
  try { return JSON.parse(localStorage.getItem(ROWS_CACHE_KEY) || "[]"); } catch { return []; }
}
function saveRowsCache(r: CompanyRow[], p: Phase) {
  try {
    localStorage.setItem(ROWS_CACHE_KEY, JSON.stringify(r));
    localStorage.setItem(PHASE_CACHE_KEY, p);
  } catch {}
}

export function ChurnAnalyzer() {
  const cached = loadCachedRows();
  const cachedPhase = (localStorage.getItem(PHASE_CACHE_KEY) || "input") as Phase;

  const [phase, setPhase] = useState<Phase>(cached.length > 0 ? cachedPhase : "input");
  const [domainsRaw, setDomainsRaw] = useState("");
  const [rows, setRows] = useState<CompanyRow[]>(cached);
  const [lookupError, setLookupError] = useState("");
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [expandedDomains, setExpandedDomains] = useState<Record<string, boolean>>({});
  const [savedMappings, setSavedMappings] = useState<SavedMappings>({});
  const [showSaved, setShowSaved] = useState(false);

  const hsToken = (() => { try { return localStorage.getItem("b2br_hubspot_token") || ""; } catch { return ""; } })();

  // ── Load saved mappings on mount ─────────────────────────────────────────
  useEffect(() => {
    dbGet("app_data", MAPPINGS_KEY).then((val: SavedMappings | null) => {
      if (val && typeof val === "object") setSavedMappings(val);
    });
  }, []);

  async function persistMappings(updated: SavedMappings) {
    setSavedMappings(updated);
    await dbPut("app_data", MAPPINGS_KEY, updated);
  }

  function saveRowMappings(updatedRows: CompanyRow[]) {
    const additions: SavedMappings = {};
    updatedRows.filter(r => r.status === "found" && r.companyId).forEach(r => {
      additions[r.inputDomain] = {
        companyId: r.companyId!, companyName: r.companyName!, domain: r.domain || r.inputDomain,
        website: r.website || "", industry: r.industry || "", employees: r.employees || "", revenue: r.revenue || "",
      };
    });
    if (Object.keys(additions).length > 0) {
      persistMappings({ ...savedMappings, ...additions });
    }
  }

  // ── Manual match handler ─────────────────────────────────────────────────
  async function handleManualMatch(inputDomain: string, company: { id: string; name: string; domain: string; website: string; industry: string; employees: string; revenue: string }) {
    const [emailAssoc, notesAssoc] = await Promise.all([
      hsCall(`/crm/v3/objects/companies/${company.id}/associations/emails`),
      hsCall(`/crm/v3/objects/companies/${company.id}/associations/notes`),
    ]);

    const updatedRow: Partial<CompanyRow> = {
      status: "found" as const, included: true,
      companyId: company.id, companyName: company.name, domain: company.domain,
      website: company.website, industry: company.industry, employees: company.employees,
      revenue: company.revenue, emailCount: (emailAssoc?.results || []).length,
      notesCount: (notesAssoc?.results || []).length,
    };

    setRows(prev => {
      const next = prev.map(r => r.inputDomain !== inputDomain ? r : { ...r, ...updatedRow });
      saveRowMappings(next);
      return next;
    });
  }

  // ── Phase 1 → Lookup ────────────────────────────────────────────────────
  async function handleLookup() {
    const domains = domainsRaw
      .split(/[\n,]+/)
      .map(d => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
      .filter(Boolean);

    if (!domains.length) return;
    if (!hsToken) { setLookupError("No HubSpot token. Add it in Settings → API Keys."); return; }
    setLookupError("");
    setPhase("lookup");

    const COMPANY_PROPS = ["name", "domain", "website", "industry", "numberofemployees", "annualrevenue"];

    function normalizeWebsite(url: string): string {
      return (url || "").toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "").trim();
    }

    function isDomainMatch(c: any, domain: string): boolean {
      const p = c.properties || {};
      const cd = (p.domain || "").toLowerCase().trim();
      const cw = normalizeWebsite(p.website || "");
      return cd === domain || cw === domain || cd === "www." + domain || cw === "www." + domain;
    }

    async function findCompanyByDomain(domain: string): Promise<any | null> {
      // Run exact filter + full-text query in parallel
      // Full-text query is the same mechanism the manual search uses — trust it
      const [rFilter, rQuery] = await Promise.all([
        hsCall("/crm/v3/objects/companies/search", "POST", {
          filterGroups: [{ filters: [{ propertyName: "domain", operator: "EQ", value: domain }] }],
          properties: COMPANY_PROPS, limit: 1,
        }),
        hsCall("/crm/v3/objects/companies/search", "POST", {
          query: domain, properties: COMPANY_PROPS, limit: 5,
        }),
      ]);

      // Prefer an exact filter hit
      if (rFilter?.results?.[0]) return rFilter.results[0];

      // From full-text results, prefer one whose stored domain/website matches
      const verified = (rQuery?.results || []).find((c: any) => isDomainMatch(c, domain));
      if (verified) return verified;

      // Otherwise trust the first full-text result — same as what manual search returns
      if (rQuery?.results?.[0]) return rQuery.results[0];

      return null;
    }

    // Sequential to avoid HubSpot rate limits (each domain = 4+ API calls)
    const results: CompanyRow[] = [];
    for (const domain of domains) {
      const base: CompanyRow = { inputDomain: domain, status: "error", emailCount: 0, notesCount: 0, included: true };
      try {
        // Check saved mappings first
        const saved = savedMappings[domain];
        if (saved) {
          const emailAssoc = await hsCall(`/crm/v3/objects/companies/${saved.companyId}/associations/emails`);
          const notesAssoc = await hsCall(`/crm/v3/objects/companies/${saved.companyId}/associations/notes`);
          results.push({
            ...base, status: "found" as const,
            companyId: saved.companyId, companyName: saved.companyName,
            domain: saved.domain, website: saved.website, industry: saved.industry,
            employees: saved.employees, revenue: saved.revenue,
            emailCount: (emailAssoc?.results || []).length,
            notesCount: (notesAssoc?.results || []).length,
          });
          continue;
        }

        const match = await findCompanyByDomain(domain);
        if (!match) { results.push({ ...base, status: "not_found" as const }); continue; }

        const props = match.properties || {};
        const id: string = match.id;

        const emailAssoc = await hsCall(`/crm/v3/objects/companies/${id}/associations/emails`);
        const notesAssoc = await hsCall(`/crm/v3/objects/companies/${id}/associations/notes`);

        results.push({
          ...base,
          status: "found" as const,
          companyId: id,
          companyName: props.name || domain,
          domain: props.domain || domain,
          website: props.website || "",
          industry: props.industry || "",
          employees: props.numberofemployees || "",
          revenue: props.annualrevenue || "",
          emailCount: (emailAssoc?.results || []).length,
          notesCount: (notesAssoc?.results || []).length,
        });
      } catch {
        results.push({ ...base, status: "error" as const });
      }
    }

    saveRowMappings(results);
    setRows(results);
    setPhase("review");
  }

  // ── Shared: call edge function in batches of 5, update UI progressively ──
  async function runScoring(payload: any[]) {
    const BATCH = 5;
    const analyzedAt = new Date().toISOString();
    for (let i = 0; i < payload.length; i += BATCH) {
      const batch = payload.slice(i, i + BATCH);
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/churn-analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ companies: batch }),
        });
        const data = await res.json();
        const batchResults: any[] = data.results || [];
        setRows(prev => prev.map(r => {
          const result = batchResults.find((x: any) => x.domain === (r.domain || r.inputDomain) || x.companyName === r.companyName);
          if (!result) return r;
          return { ...r, result, analyzeStatus: "done" as const, analyzedAt, fromCache: false };
        }));
        // Persist each result to Supabase so future runs can skip the AI call
        await Promise.all(batchResults.map(result =>
          dbPut("app_data", resultCacheKey(result.domain), { result, analyzedAt, companyName: result.companyName })
        ));
      } catch {
        // batch failed — continue to next
      }
    }
  }

  // ── Phase 3 → Fetch + Analyze ───────────────────────────────────────────
  async function handleAnalyze() {
    const included = rows.filter(r => r.status === "found" && r.included);
    if (!included.length) return;
    setPhase("fetching");
    setAnalyzeProgress(0);

    // Step 1: fetch full activity for each company — sequential to avoid HubSpot rate limits
    const withActivity: Array<CompanyRow & { activityText: string }> = [];
    for (const r of included) {
      const contactAssoc = await hsCall(`/crm/v3/objects/companies/${r.companyId}/associations/contacts`);
      const contactIds = (contactAssoc?.results || []).map((x: any) => x.id || x.toObjectId).filter(Boolean).slice(0, 10);
      const { text, emailCount, notesCount } = await fetchActivityText(r.companyId!, contactIds);
      withActivity.push({ ...r, activityText: text, emailCount, notesCount });
    }

    // Update rows with fresh counts + persist activityText for rescoring
    setRows(prev => prev.map(r => {
      const updated = withActivity.find(w => w.companyId === r.companyId);
      return updated ? { ...r, emailCount: updated.emailCount, notesCount: updated.notesCount, activityText: updated.activityText } : r;
    }));

    // Check Supabase cache for each company before calling AI
    const cachedEntries = await Promise.all(
      withActivity.map(r => dbGet("app_data", resultCacheKey(r.domain || r.inputDomain)))
    );

    const needsScoring: typeof withActivity = [];
    const cachedRows: { companyId: string; result: ChurnResult; analyzedAt: string }[] = [];
    withActivity.forEach((r, i) => {
      const entry = cachedEntries[i];
      if (entry?.result) {
        cachedRows.push({ companyId: r.companyId!, result: entry.result, analyzedAt: entry.analyzedAt });
      } else {
        needsScoring.push(r);
      }
    });

    // Apply cached results immediately, mark uncached as pending
    setRows(prev => prev.map(r => {
      const cached = cachedRows.find(c => c.companyId === r.companyId);
      if (cached) return { ...r, result: cached.result, analyzeStatus: "done" as const, analyzedAt: cached.analyzedAt, fromCache: true };
      const wa = withActivity.find(w => w.companyId === r.companyId);
      return wa ? { ...r, analyzeStatus: "pending" as const } : r;
    }));
    setPhase("results");

    if (needsScoring.length > 0) {
      const payload = needsScoring.map(r => ({
        domain: r.domain || r.inputDomain,
        companyName: r.companyName || r.inputDomain,
        hubspotId: r.companyId,
        website: r.website,
        activityText: r.activityText,
        companyInfo: { industry: r.industry, numberofemployees: r.employees, annualrevenue: r.revenue },
      }));
      await runScoring(payload);
    }

    setRows(prev => { saveRowsCache(prev, "results"); return prev; });
  }

  // ── Rescore (bypasses result cache, force re-runs AI, overwrites stored results) ──
  async function handleRescore() {
    const scoreable = rows.filter(r => r.status === "found" && r.result);
    if (!scoreable.length) return;

    // Mark all as pending so user sees rescoring in progress on each card
    setRows(prev => prev.map(r => scoreable.some(s => s.companyId === r.companyId) ? { ...r, analyzeStatus: "pending" as const } : r));
    setPhase("results");

    const payload = scoreable.map(r => ({
      domain: r.domain || r.inputDomain,
      companyName: r.companyName || r.inputDomain,
      hubspotId: r.companyId,
      website: r.website,
      activityText: r.activityText || "",
      companyInfo: { industry: r.industry, numberofemployees: r.employees, annualrevenue: r.revenue },
    }));

    await runScoring(payload);
    setRows(prev => { saveRowsCache(prev, "results"); return prev; });
  }

  // ── HTML Export ──────────────────────────────────────────────────────────
  function exportHTML() {
    const scored = rows.filter(r => r.result);
    const counts = {
      "Likely Fit": scored.filter(r => r.result?.fitScore === "Likely Fit").length,
      "Needs Review": scored.filter(r => r.result?.fitScore === "Needs Review").length,
      "Disqualified": scored.filter(r => r.result?.fitScore === "Disqualified").length,
    };

    function esc(s: any) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

    function badge(label: string, type: "pfu" | "rr" | "margin" | "fit") {
      const styles: Record<string, string> = {
        PASS: "background:#00D68F12;border:1px solid #00D68F33;color:#00D68F",
        FAIL: "background:#FF6B6B12;border:1px solid #FF6B6B33;color:#FF6B6B",
        UNSURE: "background:#FFC04812;border:1px solid #FFC04833;color:#FFC048",
        PRESENT: "background:#00D68F12;border:1px solid #00D68F33;color:#00D68F",
        ABSENT: "background:#F3F4FB;border:1px solid #EDF2F7;color:#636E82",
        high: "background:#00D68F12;border:1px solid #00D68F33;color:#00D68F",
        medium: "background:#FFC04812;border:1px solid #FFC04833;color:#FFC048",
        low: "background:#FF6B6B12;border:1px solid #FF6B6B33;color:#FF6B6B",
        "Likely Fit": "background:#00D68F12;border:1px solid #00D68F33;color:#00D68F",
        "Needs Review": "background:#FFC04812;border:1px solid #FFC04833;color:#FFC048",
        Disqualified: "background:#FF6B6B12;border:1px solid #FF6B6B33;color:#FF6B6B",
      };
      const s = styles[label] || styles["UNSURE"];
      return `<span style="${s};display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:800;letter-spacing:0.6px;text-transform:uppercase;font-family:monospace">${esc(label)}</span>`;
    }

    function dimCard(title: string, verdict: string, reason: string, subs?: { label: string; value: string; reason: string }[]) {
      const verdictStyle = verdict === "PASS" ? "background:#00D68F12;border:1px solid #00D68F33"
        : verdict === "FAIL" ? "background:#FF6B6B12;border:1px solid #FF6B6B33"
        : "background:#FFC04812;border:1px solid #FFC04833";
      return `<div style="${verdictStyle};border-radius:8px;padding:12px 14px">
        <div style="font-size:10px;font-weight:700;color:#8E94A7;font-family:monospace;letter-spacing:0.7px;text-transform:uppercase;margin-bottom:6px">${esc(title)}</div>
        ${badge(verdict, "pfu")}
        ${reason ? `<div style="font-size:12px;color:#636E82;line-height:1.5;margin-top:8px">${esc(reason)}</div>` : ""}
        ${subs ? subs.map(sub => `
          <div style="margin-top:8px">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
              <span style="font-size:10px;color:#8E94A7;font-family:monospace;min-width:70px">${esc(sub.label)}</span>
              ${badge(sub.value || "?", "pfu")}
            </div>
            ${sub.reason ? `<div style="font-size:11px;color:#8E94A7;line-height:1.4;padding-left:4px">${esc(sub.reason)}</div>` : ""}
          </div>`).join("") : ""}
      </div>`;
    }

    const groups = ["Likely Fit", "Needs Review", "Disqualified"] as const;
    const groupColors: Record<string, string> = {
      "Likely Fit": "#00D68F", "Needs Review": "#FFC048", Disqualified: "#FF6B6B",
    };

    const cardsHtml = groups.map(score => {
      const groupRows = scored.filter(r => r.result?.fitScore === score);
      if (!groupRows.length) return "";
      return `
        <div style="margin-bottom:36px">
          <div style="font-size:11px;font-weight:800;color:#8E94A7;font-family:monospace;letter-spacing:1px;text-transform:uppercase;margin-bottom:14px">${esc(score)} (${groupRows.length})</div>
          ${groupRows.map(r => {
            const res = r.result!;
            return `
            <div style="background:#fff;border:1px solid #EDF2F7;border-radius:12px;overflow:hidden;margin-bottom:16px">
              <!-- header -->
              <div style="padding:16px 20px;border-bottom:1px solid #EDF2F7">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;flex-wrap:wrap">
                  <div style="font-size:15px;font-weight:800;color:#2D3436">${esc(r.companyName)}</div>
                  ${badge(res.fitScore, "fit")}
                </div>
                <div style="font-size:12px;color:#8E94A7;font-family:monospace">
                  ${esc(r.domain || r.inputDomain)}${r.industry ? ` · ${esc(r.industry)}` : ""}${r.employees ? ` · ${esc(r.employees)} employees` : ""}
                  <span style="color:#6C5CE7;margin-left:10px">${r.emailCount} emails</span>${r.notesCount > 0 ? ` · <span style="color:#636E82">${r.notesCount} notes</span>` : ""}
                </div>
              </div>
              <!-- churn reason -->
              <div style="padding:14px 20px;border-bottom:1px solid #EDF2F7;background:#FF6B6B12">
                <div style="font-size:10px;font-weight:800;color:#FF6B6B;font-family:monospace;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:6px">Churn Reason</div>
                <div style="font-size:13.5px;color:#2D3436;line-height:1.6;font-weight:500">${esc(res.churnReason)}</div>
                ${res.churnReasonDetail ? `<div style="font-size:13px;color:#636E82;line-height:1.7;margin-top:8px">${esc(res.churnReasonDetail)}</div>` : ""}
              </div>
              <!-- proof points -->
              ${res.churnProofPoints?.length ? `
              <div style="padding:14px 20px;border-bottom:1px solid #EDF2F7;background:#F3F4FB">
                <div style="font-size:10px;font-weight:800;color:#8E94A7;font-family:monospace;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:10px">Evidence from Communications</div>
                ${res.churnProofPoints.map(pt => `
                  <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:7px">
                    <div style="width:5px;height:5px;border-radius:50%;background:#FF6B6B;flex-shrink:0;margin-top:6px"></div>
                    <div style="font-size:12.5px;color:#2D3436;font-family:monospace;line-height:1.55">${esc(pt)}</div>
                  </div>`).join("")}
              </div>` : ""}
              <!-- 3 dimensions -->
              <div style="padding:14px 20px;border-bottom:1px solid #EDF2F7;display:grid;grid-template-columns:repeat(3,1fr);gap:14px">
                ${dimCard("ROI Fit", res.roiFit, res.roiFitReason, [
                  { label: "AOV ≥$5k", value: res.aov, reason: res.aovReason },
                  { label: "Cycle ≤75d", value: res.salesCycle, reason: res.salesCycleReason },
                  { label: "Recurring", value: res.recurringRevenue, reason: res.recurringRevenueReason },
                  { label: "Margin", value: res.grossMargin, reason: res.grossMarginReason },
                ])}
                ${dimCard("Sales Capacity", res.salesCapacity, res.salesCapacityReason)}
                ${dimCard("Audience Clarity", res.audienceClarity, res.audienceClarityReason)}
              </div>
              <!-- verdict + recommendation -->
              <div style="padding:14px 20px">
                ${res.overallVerdict ? `<div style="font-size:13.5px;color:#2D3436;line-height:1.6;margin-bottom:10px">${esc(res.overallVerdict)}</div>` : ""}
                ${res.recommendation ? `<div style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:#6C5CE70D;border:1px solid #6C5CE733;border-radius:7px;font-size:12.5px;color:#6C5CE7;font-weight:600">→ ${esc(res.recommendation)}</div>` : ""}
              </div>
            </div>`;
          }).join("")}
        </div>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Churned VIP Analysis — ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #F8F9FE; font-family: 'Inter', system-ui, sans-serif; color: #2D3436; }
  .header { background: #fff; border-bottom: 1px solid #EDF2F7; padding: 16px 32px; }
  .header-title { font-size: 15px; font-weight: 800; color: #2D3436; }
  .header-sub { font-size: 11px; color: #8E94A7; font-family: monospace; margin-top: 2px; }
  .header-date { font-size: 12px; color: #8E94A7; font-family: monospace; }
  .content { max-width: 960px; margin: 0 auto; padding: 36px 32px; }
  .summary-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; margin-bottom: 36px; }
</style>
</head>
<body>
<div class="header" style="display:flex;align-items:center;justify-content:space-between">
  <div>
    <div class="header-title">Churned VIP Analyzer</div>
    <div class="header-sub">HubSpot activity · Churn reason · Re-engagement fit · ROI</div>
  </div>
  <div class="header-date">Generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
</div>
<div class="content">
  <h1 style="font-size:22px;font-weight:800;margin-bottom:6px">Analysis Results</h1>
  <div style="font-size:13px;color:#636E82;font-family:monospace;margin-bottom:24px">${scored.length} companies analyzed</div>
  <div class="summary-grid">
    ${([["Likely Fit","#00D68F","#00D68F12","#00D68F33"],["Needs Review","#FFC048","#FFC04812","#FFC04833"],["Disqualified","#FF6B6B","#FF6B6B12","#FF6B6B33"]] as [string,string,string,string][]).map(([label, color, bg, border]) => `
    <div style="background:${bg};border:1px solid ${border};border-radius:10px;padding:16px 20px;text-align:center">
      <div style="font-size:32px;font-weight:800;color:${color}">${counts[label as keyof typeof counts]}</div>
      <div style="font-size:10px;font-weight:700;color:${color};font-family:monospace;letter-spacing:0.8px;text-transform:uppercase;margin-top:2px">${label}</div>
    </div>`).join("")}
  </div>
  ${cardsHtml}
</div>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `churn-analysis-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── CSV Export ───────────────────────────────────────────────────────────
  function exportCSV() {
    const cols = [
      "Domain", "Company Name", "Industry", "Employees", "Emails", "Notes",
      "Fit Score",
      "ROI Fit", "ROI Fit Reason",
      "AOV ≥$5k", "AOV Reason",
      "Sales Cycle ≤75d", "Sales Cycle Reason",
      "Recurring Revenue", "Recurring Revenue Reason",
      "Gross Margin", "Gross Margin Reason",
      "Sales Capacity", "Sales Capacity Reason",
      "Audience Clarity", "Audience Clarity Reason",
      "Churn Reason", "Churn Reason Detail", "Proof Points",
      "Overall Verdict", "Recommendation",
    ];

    const csvEsc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;

    const lines = rows.filter(r => r.result).map(r => {
      const res = r.result!;
      return [
        r.domain || r.inputDomain, r.companyName || "", r.industry || "",
        r.employees || "", r.emailCount, r.notesCount,
        res.fitScore,
        res.roiFit, res.roiFitReason,
        res.aov, res.aovReason,
        res.salesCycle, res.salesCycleReason,
        res.recurringRevenue, res.recurringRevenueReason,
        res.grossMargin, res.grossMarginReason,
        res.salesCapacity, res.salesCapacityReason,
        res.audienceClarity, res.audienceClarityReason,
        res.churnReason, res.churnReasonDetail,
        (res.churnProofPoints || []).join(" | "),
        res.overallVerdict, res.recommendation,
      ].map(csvEsc).join(",");
    });

    const csv = [cols.map(csvEsc).join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `churn-analysis-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const includedCount = rows.filter(r => r.status === "found" && r.included).length;
  const foundCount = rows.filter(r => r.status === "found").length;
  const pendingRows = rows.filter(r => r.analyzeStatus === "pending");
  const resultRows = rows.filter(r => r.result && r.analyzeStatus !== "pending");

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: body }}>
      {/* Header */}
      <div style={{ background: C.canvas, borderBottom: `1px solid ${C.border}`, padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/" style={{ fontSize: 12, color: C.muted, textDecoration: "none", fontFamily: mono }}>← Back</a>
          <span style={{ color: C.border }}>|</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: head }}>Churned VIP Analyzer</div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: mono }}>HubSpot activity · Churn reason · Re-engagement fit · ROI</div>
          </div>
        </div>
        {phase === "results" && (
          <button onClick={exportCSV} style={{
            padding: "8px 18px", borderRadius: 8, border: `1px solid ${C.accentBorder}`,
            background: C.accent, color: "#fff", fontSize: 12.5, fontWeight: 700,
            fontFamily: head, cursor: "pointer",
          }}>
            Export CSV
          </button>
        )}
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "36px 32px" }}>

        {/* ── Phase: input ─────────────────────────────────────────────────── */}
        {phase === "input" && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, fontFamily: head, marginBottom: 6 }}>Churned VIP Analysis</h1>
              <p style={{ fontSize: 14, color: C.textSoft, lineHeight: 1.6, maxWidth: 640 }}>
                Paste the domains of churned VIP clients. This tool will map them to HubSpot, pull all email activity,
                research their business, and assess churn reason + B2B Rocket re-engagement fit.
              </p>
            </div>

            {!hsToken && (
              <div style={{ background: C.amberLo, border: `1px solid ${C.amberBorder}`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: C.amber, fontFamily: head, fontWeight: 600 }}>
                ⚠ No HubSpot token found. Add it in Settings → API Keys before continuing.
              </div>
            )}

            <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.textSoft, fontFamily: mono, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 }}>
                Client Domains (one per line)
              </label>
              <textarea
                value={domainsRaw}
                onChange={e => setDomainsRaw(e.target.value)}
                placeholder={"acme.com\nbigcorp.io\nexampleclient.com"}
                style={{
                  width: "100%", minHeight: 180, padding: "12px 14px", borderRadius: 8,
                  border: `1px solid ${C.borderHi}`, fontSize: 13.5, fontFamily: mono,
                  color: C.text, background: C.bg, resize: "vertical", outline: "none",
                  boxSizing: "border-box", lineHeight: 1.7,
                }}
              />
            </div>

            {lookupError && (
              <div style={{ background: C.redLo, border: `1px solid ${C.redBorder}`, borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: C.red, fontFamily: head }}>
                {lookupError}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
              <button
                onClick={handleLookup}
                disabled={!domainsRaw.trim() || !hsToken}
                style={{
                  padding: "11px 28px", borderRadius: 9, border: "none",
                  background: domainsRaw.trim() && hsToken ? C.accent : C.surface,
                  color: domainsRaw.trim() && hsToken ? "#fff" : C.muted,
                  fontSize: 13.5, fontWeight: 700, fontFamily: head,
                  cursor: domainsRaw.trim() && hsToken ? "pointer" : "not-allowed",
                  transition: "all .15s",
                }}
              >
                Lookup in HubSpot →
              </button>
            </div>

            {/* Saved mappings panel */}
            {Object.keys(savedMappings).length > 0 && (
              <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div
                  onClick={() => setShowSaved(s => !s)}
                  style={{ padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", borderBottom: showSaved ? `1px solid ${C.border}` : "none" }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, fontFamily: head }}>
                    Saved mappings <span style={{ fontWeight: 400, color: C.muted }}>({Object.keys(savedMappings).length} domains)</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      onClick={e => { e.stopPropagation(); const all = Object.keys(savedMappings).join("\n"); setDomainsRaw(prev => prev ? prev + "\n" + all : all); }}
                      style={{ padding: "3px 10px", borderRadius: 6, border: `1px solid ${C.accentBorder}`, background: C.accentLo, color: C.accent, fontSize: 11, fontWeight: 700, fontFamily: head, cursor: "pointer" }}
                    >Load all</button>
                    <span style={{ fontSize: 12, color: C.muted, fontFamily: mono }}>{showSaved ? "▲" : "▼"}</span>
                  </div>
                </div>
                {showSaved && (
                  <div>
                    {Object.entries(savedMappings).map(([domain, m]) => (
                      <div key={domain} style={{ padding: "9px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 12, fontFamily: mono, color: C.textSoft, minWidth: 160 }}>{domain}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: head }}>{m.companyName}</span>
                          {m.industry && <span style={{ fontSize: 11, color: C.muted, fontFamily: body }}>{m.industry}</span>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button
                            onClick={() => { setDomainsRaw(prev => prev ? prev + "\n" + domain : domain); }}
                            style={{ padding: "3px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.textSoft, fontSize: 11, fontFamily: mono, cursor: "pointer" }}
                          >+ Add</button>
                          <button
                            onClick={() => { const next = { ...savedMappings }; delete next[domain]; persistMappings(next); }}
                            style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${C.redBorder}`, background: C.redLo, color: C.red, fontSize: 11, fontFamily: mono, cursor: "pointer" }}
                          >×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Phase: lookup (loading) ──────────────────────────────────────── */}
        {phase === "lookup" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 40, height: 40, border: `3px solid ${C.accentBorder}`, borderTopColor: C.accent, borderRadius: "50%", animation: "spin 0.9s linear infinite", margin: "0 auto 16px" }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: head, marginBottom: 6 }}>Looking up domains in HubSpot…</div>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: mono }}>Searching companies and counting activity</div>
            </div>
          </div>
        )}

        {/* ── Phase: review ────────────────────────────────────────────────── */}
        {phase === "review" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, fontFamily: head, marginBottom: 4 }}>HubSpot Matches</h2>
                <div style={{ fontSize: 13, color: C.textSoft, fontFamily: mono }}>
                  {foundCount}/{rows.length} domains matched · {includedCount} selected for analysis
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setPhase("input"); }} style={{
                  padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.borderHi}`,
                  background: C.canvas, color: C.textSoft, fontSize: 12, fontWeight: 600,
                  fontFamily: head, cursor: "pointer",
                }}>← Edit Domains</button>
                <button onClick={handleAnalyze} disabled={includedCount === 0} style={{
                  padding: "8px 20px", borderRadius: 8, border: "none",
                  background: includedCount > 0 ? C.accent : C.surface,
                  color: includedCount > 0 ? "#fff" : C.muted,
                  fontSize: 13, fontWeight: 700, fontFamily: head,
                  cursor: includedCount > 0 ? "pointer" : "not-allowed",
                }}>
                  Run Analysis ({includedCount}) →
                </button>
              </div>
            </div>

            <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.surface }}>
                    {["Include", "Input Domain", "Company Name", "Industry", "Emails", "Notes", "Status"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 800, color: C.muted, fontFamily: mono, letterSpacing: 0.8, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.inputDomain} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : "none", opacity: r.status === "error" ? 0.4 : 1 }}>
                      <td style={{ padding: "10px 14px" }}>
                        <input
                          type="checkbox"
                          checked={r.included && r.status === "found"}
                          disabled={r.status !== "found"}
                          onChange={e => setRows(prev => prev.map((x, j) => j === i ? { ...x, included: e.target.checked } : x))}
                          style={{ cursor: r.status === "found" ? "pointer" : "not-allowed" }}
                        />
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 12.5, fontFamily: mono, color: C.text }}>{r.inputDomain}</td>
                      <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, fontFamily: head, color: C.text }}>
                        {r.status === "found"
                          ? <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span>{r.companyName || "—"}</span>
                              <button
                                onClick={() => setRows(prev => prev.map((x, j) => j === i ? { ...x, status: "not_found" as const, included: false } : x))}
                                title="Change company"
                                style={{ padding: "2px 7px", borderRadius: 5, border: `1px solid ${C.borderHi}`, background: C.surface, color: C.muted, fontSize: 10, fontFamily: mono, cursor: "pointer", lineHeight: 1.4 }}
                              >change</button>
                            </div>
                          : <ManualSearch inputDomain={r.inputDomain} onMatch={handleManualMatch} />}
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 12, color: C.textSoft, fontFamily: body }}>{r.industry || "—"}</td>
                      <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, color: C.accent, fontFamily: mono }}>{r.emailCount || 0}</td>
                      <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, color: C.textSoft, fontFamily: mono }}>{r.notesCount || 0}</td>
                      <td style={{ padding: "10px 14px" }}>
                        {r.status === "found" && <Badge label="Found" color={{ bg: C.greenLo, border: C.greenBorder, text: C.green }} />}
                        {r.status === "not_found" && <Badge label="Not Found" color={{ bg: C.amberLo, border: C.amberBorder, text: C.amber }} />}
                        {r.status === "error" && <Badge label="Error" color={{ bg: C.redLo, border: C.redBorder, text: C.red }} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Phase: fetching / analyzing ──────────────────────────────────── */}
        {(phase === "fetching" || phase === "analyzing") && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
            <div style={{ textAlign: "center", maxWidth: 420 }}>
              <div style={{ width: 44, height: 44, border: `3px solid ${C.accentBorder}`, borderTopColor: C.accent, borderRadius: "50%", animation: "spin 0.9s linear infinite", margin: "0 auto 20px" }} />
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: head, marginBottom: 8 }}>
                {phase === "fetching" ? "Pulling HubSpot activity…" : "Analyzing companies…"}
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, fontFamily: mono, lineHeight: 1.6 }}>
                {phase === "fetching"
                  ? "Fetching all emails, notes, and calls for each company"
                  : "Scraping websites + running AI churn analysis · This takes 30–60 seconds"}
              </div>
              {/* Mini progress list */}
              <div style={{ marginTop: 24, textAlign: "left", display: "inline-block" }}>
                {rows.filter(r => r.status === "found" && r.included).map(r => (
                  <div key={r.inputDomain} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      background: r.analyzeStatus === "done" ? C.green : r.analyzeStatus === "error" ? C.red : C.accent,
                      opacity: r.analyzeStatus ? 1 : 0.4,
                    }} />
                    <span style={{ fontSize: 12, fontFamily: mono, color: C.textSoft }}>{r.companyName || r.inputDomain}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Phase: results ────────────────────────────────────────────────── */}
        {phase === "results" && (
          <div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, fontFamily: head, marginBottom: 6 }}>Analysis Results</h2>
                <div style={{ fontSize: 13, color: C.textSoft, fontFamily: mono }}>
                  {resultRows.length + pendingRows.length} companies · {resultRows.length} scored
                  {resultRows.filter(r => r.fromCache).length > 0 && <span style={{ color: C.muted }}> · {resultRows.filter(r => r.fromCache).length} from cache</span>}
                  {pendingRows.length > 0 && <span style={{ color: C.accent }}> · {pendingRows.length} analyzing…</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setPhase("review"); }} style={{
                  padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.borderHi}`,
                  background: C.canvas, color: C.textSoft, fontSize: 12, fontWeight: 600,
                  fontFamily: head, cursor: "pointer",
                }}>← Back</button>
                <button onClick={handleRescore} style={{
                  padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.accentBorder}`,
                  background: C.accentLo, color: C.accent, fontSize: 12, fontWeight: 700,
                  fontFamily: head, cursor: "pointer",
                }}>↻ Rescore</button>
                <button onClick={exportHTML} style={{
                  padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.borderHi}`,
                  background: C.canvas, color: C.textSoft, fontSize: 12, fontWeight: 700,
                  fontFamily: head, cursor: "pointer",
                }}>Export HTML</button>
                <button onClick={exportCSV} style={{
                  padding: "8px 18px", borderRadius: 8, border: "none",
                  background: C.accent, color: "#fff", fontSize: 12.5, fontWeight: 700,
                  fontFamily: head, cursor: "pointer",
                }}>Export CSV</button>
              </div>
            </div>

            {/* Summary bar */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 28 }}>
              {[
                { label: "Likely Fit", color: C.green, bg: C.greenLo, border: C.greenBorder },
                { label: "Needs Review", color: C.amber, bg: C.amberLo, border: C.amberBorder },
                { label: "Disqualified", color: C.red, bg: C.redLo, border: C.redBorder },
              ].map(s => (
                <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: "16px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: s.color, fontFamily: head }}>
                    {resultRows.filter(r => r.result?.fitScore === s.label).length}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: s.color, fontFamily: mono, letterSpacing: 0.8, textTransform: "uppercase", marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Pending / in-progress cards */}
            {pendingRows.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.accent, fontFamily: mono, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.accent, animation: "spin 1.2s linear infinite" }} />
                  Analyzing ({pendingRows.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {pendingRows.map(r => (
                    <div key={r.inputDomain} style={{ background: C.canvas, border: `1px solid ${C.accentBorder}`, borderRadius: 12, padding: "14px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 16, height: 16, border: `2px solid ${C.accentBorder}`, borderTopColor: C.accent, borderRadius: "50%", animation: "spin 0.9s linear infinite", flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, fontFamily: head }}>{r.companyName || r.inputDomain}</div>
                        <div style={{ fontSize: 11.5, color: C.muted, fontFamily: mono, marginTop: 2 }}>{r.domain || r.inputDomain}{r.emailCount ? ` · ${r.emailCount} emails` : ""}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Company cards */}
            {["Likely Fit", "Needs Review", "Disqualified"].map(score => {
              const groupRows = resultRows.filter(r => r.result?.fitScore === score);
              if (!groupRows.length) return null;
              return (
                <div key={score} style={{ marginBottom: 32 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, fontFamily: mono, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
                    {score} ({groupRows.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {groupRows.map(r => {
                      const res = r.result!;
                      const expanded = !!expandedDomains[r.inputDomain];
                      return (
                        <div key={r.inputDomain} style={{
                          background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden",
                        }}>
                          {/* Card header */}
                          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                                <div style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: head }}>{r.companyName}</div>
                                <Badge label={res.fitScore} color={fitColor(res.fitScore)} />
                              </div>
                              <div style={{ fontSize: 12, color: C.muted, fontFamily: mono }}>
                                {r.domain || r.inputDomain}
                                {r.industry && ` · ${r.industry}`}
                                {r.employees && ` · ${r.employees} employees`}
                                <span style={{ marginLeft: 10, color: C.accent }}>{r.emailCount} emails</span>
                                {r.notesCount > 0 && <span style={{ color: C.textSoft }}> · {r.notesCount} notes</span>}
                                {r.fromCache && r.analyzedAt && (
                                  <span style={{ marginLeft: 10, color: C.muted }}>
                                    · cached {new Date(r.analyzedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => setExpandedDomains(prev => ({ ...prev, [r.inputDomain]: !prev[r.inputDomain] }))}
                              style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.textSoft, fontSize: 11, fontFamily: mono, cursor: "pointer", flexShrink: 0, marginLeft: 12 }}
                            >
                              {expanded ? "▲ Less" : "▼ More"}
                            </button>
                          </div>

                          {/* Churn reason */}
                          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, background: C.redLo }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: C.red, fontFamily: mono, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>Churn Reason</div>
                            <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.6, fontFamily: body, fontWeight: 500 }}>{res.churnReason}</div>
                            {expanded && res.churnReasonDetail && (
                              <div style={{ fontSize: 13, color: C.textSoft, lineHeight: 1.7, fontFamily: body, marginTop: 8 }}>{res.churnReasonDetail}</div>
                            )}
                          </div>

                          {/* Proof points from communications */}
                          {res.churnProofPoints?.length > 0 && (
                            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
                              <div style={{ fontSize: 10, fontWeight: 800, color: C.textSoft, fontFamily: mono, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }}>
                                Evidence from Communications
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                                {(expanded ? res.churnProofPoints : res.churnProofPoints.slice(0, 3)).map((pt, idx) => (
                                  <div key={idx} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.red, flexShrink: 0, marginTop: 6 }} />
                                    <div style={{ fontSize: 12.5, color: C.text, fontFamily: mono, lineHeight: 1.55 }}>{pt}</div>
                                  </div>
                                ))}
                                {!expanded && res.churnProofPoints.length > 3 && (
                                  <div style={{ fontSize: 11.5, color: C.muted, fontFamily: mono, paddingLeft: 15 }}>
                                    +{res.churnProofPoints.length - 3} more — click ▼ More to expand
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* 3 dimensions */}
                          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                            {/* Dimension 1: ROI Fit */}
                            <div style={{ background: pfu(res.roiFit).bg, border: `1px solid ${pfu(res.roiFit).border}`, borderRadius: 8, padding: "10px 12px" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, fontFamily: mono, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 5 }}>ROI Fit</div>
                              <Badge label={res.roiFit} color={pfu(res.roiFit)} />
                              {expanded && res.roiFitReason && (
                                <div style={{ fontSize: 11.5, color: C.textSoft, lineHeight: 1.5, fontFamily: body, marginTop: 6 }}>{res.roiFitReason}</div>
                              )}
                              {/* Sub-criteria */}
                              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                                {[
                                  { label: "AOV ≥$5k", value: res.aov, reason: res.aovReason, col: pfu(res.aov) },
                                  { label: "Cycle ≤75d", value: res.salesCycle, reason: res.salesCycleReason, col: pfu(res.salesCycle) },
                                  { label: "Recurring", value: res.recurringRevenue, reason: res.recurringRevenueReason, col: rrColor(res.recurringRevenue) },
                                  { label: "Margin", value: res.grossMargin, reason: res.grossMarginReason, col: marginColor(res.grossMargin) },
                                ].map(sub => (
                                  <div key={sub.label}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                      <span style={{ fontSize: 10, color: C.muted, fontFamily: mono, minWidth: 68 }}>{sub.label}</span>
                                      <Badge label={sub.value || "?"} color={sub.col} />
                                    </div>
                                    {expanded && sub.reason && (
                                      <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.4, fontFamily: body, marginTop: 2, paddingLeft: 4 }}>{sub.reason}</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Dimension 2: Sales Capacity */}
                            <div style={{ background: pfu(res.salesCapacity).bg, border: `1px solid ${pfu(res.salesCapacity).border}`, borderRadius: 8, padding: "10px 12px" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, fontFamily: mono, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 5 }}>Sales Capacity</div>
                              <Badge label={res.salesCapacity} color={pfu(res.salesCapacity)} />
                              {res.salesCapacityReason && (
                                <div style={{ fontSize: 11.5, color: C.textSoft, lineHeight: 1.5, fontFamily: body, marginTop: 6 }}>{res.salesCapacityReason}</div>
                              )}
                            </div>

                            {/* Dimension 3: Audience Clarity */}
                            <div style={{ background: pfu(res.audienceClarity).bg, border: `1px solid ${pfu(res.audienceClarity).border}`, borderRadius: 8, padding: "10px 12px" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, fontFamily: mono, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 5 }}>Audience Clarity</div>
                              <Badge label={res.audienceClarity} color={pfu(res.audienceClarity)} />
                              {res.audienceClarityReason && (
                                <div style={{ fontSize: 11.5, color: C.textSoft, lineHeight: 1.5, fontFamily: body, marginTop: 6 }}>{res.audienceClarityReason}</div>
                              )}
                            </div>
                          </div>

                          {/* Verdict + recommendation */}
                          <div style={{ padding: "14px 20px" }}>
                            {res.overallVerdict && (
                              <div style={{ fontSize: 13.5, color: C.text, fontFamily: body, lineHeight: 1.6, marginBottom: 8 }}>{res.overallVerdict}</div>
                            )}
                            {res.recommendation && (
                              <div style={{
                                display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px",
                                background: C.accentLo, border: `1px solid ${C.accentBorder}`,
                                borderRadius: 7, fontSize: 12.5, color: C.accent, fontFamily: head, fontWeight: 600,
                              }}>
                                → {res.recommendation}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
