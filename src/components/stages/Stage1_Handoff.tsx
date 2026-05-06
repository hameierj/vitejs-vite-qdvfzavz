import { useState, useEffect } from "react";
import { supabase, SUPABASE_URL } from "../../lib/supabase";

const C = {
  bg: "#F8F9FE", canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7",
  borderHi: "#D8DEE9", text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentMid: "#6C5CE722",
  accentHi: "#5A4BD6", accentBorder: "#6C5CE733",
  green: "#00D68F", greenLo: "#00D68F0F", greenBorder: "#00D68F33",
  amber: "#FFC048", amberLo: "#FFC0480F", amberBorder: "#FFC04830",
  red: "#FF6B6B", redLo: "#FF6B6B0F",
};
const head = "'Inter', 'Plus Jakarta Sans', system-ui, sans-serif";
const body = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kaXVudm1qd3B3dm95cnFubWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2Mjg4OTksImV4cCI6MjA5MDIwNDg5OX0.bu-qwXsDDqmTJEAn5KAuriTXgEFwlqxf_eIXBVF-6-Q";

// ── HubSpot proxy helper ────────────────────────────────────────────────────
async function hsCall(path: string, method: "GET" | "POST" = "GET", body?: any): Promise<any> {
  const token = (() => { try { return localStorage.getItem("b2br_hubspot_token") || ""; } catch { return ""; } })();
  if (!token) return { error: "No HubSpot token configured. Add it in Settings." };
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

// Pull all useful data for a company in parallel
async function syncHubspotCompany(companyId: string): Promise<{ company: any; contacts: any[]; deals: any[]; activity: any[]; closedWonDate: string | null }> {
  const COMPANY_PROPS = "name,domain,industry,description,phone,city,state,country,numberofemployees,annualrevenue,hubspot_owner_id,createdate,hs_lastmodifieddate,lifecyclestage,website";

  const [companyRes, contactAssoc, dealAssoc] = await Promise.all([
    hsCall(`/crm/v3/objects/companies/${companyId}?properties=${COMPANY_PROPS}`),
    hsCall(`/crm/v3/objects/companies/${companyId}/associations/contacts`),
    hsCall(`/crm/v3/objects/companies/${companyId}/associations/deals`),
  ]);

  const company = companyRes?.properties || companyRes || {};

  const contactIds = (contactAssoc?.results || []).map((r: any) => r.id || r.toObjectId).filter(Boolean).slice(0, 20);
  const dealsIds = (dealAssoc?.results || []).map((r: any) => r.id || r.toObjectId).filter(Boolean).slice(0, 10);

  const CONTACT_PROPS = ["firstname", "lastname", "email", "phone", "jobtitle", "lifecyclestage", "hs_lead_status"];
  const DEAL_PROPS = ["dealname", "dealstage", "amount", "closedate", "pipeline", "hubspot_owner_id", "description", "hs_deal_stage_probability", "hs_is_closed_won"];

  // Fetch contacts, deals, company notes/emails, and contact-level email associations all in parallel
  const [contactsRes, dealsRes, notesAssoc, companyEmailsAssoc, contactEmailAssocs] = await Promise.all([
    contactIds.length ? hsCall("/crm/v3/objects/contacts/batch/read", "POST", {
      inputs: contactIds.map((id: string) => ({ id })),
      properties: CONTACT_PROPS,
    }) : Promise.resolve({ results: [] }),
    dealsIds.length ? hsCall("/crm/v3/objects/deals/batch/read", "POST", {
      inputs: dealsIds.map((id: string) => ({ id })),
      properties: DEAL_PROPS,
    }) : Promise.resolve({ results: [] }),
    hsCall(`/crm/v3/objects/companies/${companyId}/associations/notes`),
    hsCall(`/crm/v3/objects/companies/${companyId}/associations/emails`),
    // Pull email associations from each contact (first 8) to catch emails logged at contact level
    Promise.all(contactIds.slice(0, 8).map((id: string) => hsCall(`/crm/v3/objects/contacts/${id}/associations/emails`))),
  ]);

  const contacts = (contactsRes?.results || []).map((c: any) => ({
    id: c.id,
    name: [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(" "),
    email: c.properties?.email,
    phone: c.properties?.phone,
    title: c.properties?.jobtitle,
    stage: c.properties?.lifecyclestage,
    leadStatus: c.properties?.hs_lead_status,
  })).filter((c: any) => c.name || c.email);

  const deals = (dealsRes?.results || []).map((d: any) => ({
    id: d.id,
    name: d.properties?.dealname,
    stage: d.properties?.dealstage,
    amount: d.properties?.amount,
    closeDate: d.properties?.closedate,
    pipeline: d.properties?.pipeline,
    probability: d.properties?.hs_deal_stage_probability,
    description: d.properties?.description,
    isClosedWon: d.properties?.hs_is_closed_won === "true",
  }));

  // Identify the most recent Closed Won deal — use its close date as the activity cutoff
  const closedWonDeal = deals
    .filter(d => d.isClosedWon || d.stage?.toLowerCase() === "closedwon")
    .sort((a, b) => new Date(b.closeDate || 0).getTime() - new Date(a.closeDate || 0).getTime())[0];
  const closedWonDate: string | null = closedWonDeal?.closeDate
    ? new Date(closedWonDeal.closeDate).toISOString()
    : null;

  // Collect all email IDs from company + all contacts, deduplicated
  const companyEmailIds = (companyEmailsAssoc?.results || []).map((r: any) => r.id || r.toObjectId).filter(Boolean);
  const contactEmailIds = (contactEmailAssocs as any[]).flatMap(assoc =>
    (assoc?.results || []).map((r: any) => r.id || r.toObjectId).filter(Boolean)
  );
  const allEmailIds = [...new Set([...companyEmailIds, ...contactEmailIds])].slice(0, 100);

  const noteIds = (notesAssoc?.results || []).map((r: any) => r.id || r.toObjectId).filter(Boolean).slice(0, 50);

  const [notesRes, emailsRes] = await Promise.all([
    noteIds.length ? hsCall("/crm/v3/objects/notes/batch/read", "POST", {
      inputs: noteIds.map((id: string) => ({ id })),
      properties: ["hs_note_body", "hs_timestamp"],
    }) : Promise.resolve({ results: [] }),
    allEmailIds.length ? hsCall("/crm/v3/objects/emails/batch/read", "POST", {
      inputs: allEmailIds.map((id: string) => ({ id })),
      properties: ["hs_email_subject", "hs_email_text", "hs_timestamp", "hs_email_direction", "hs_email_from_email", "hs_email_to_email"],
    }) : Promise.resolve({ results: [] }),
  ]);

  const activity = [
    ...(notesRes?.results || []).map((n: any) => ({
      type: "note",
      date: n.properties?.hs_timestamp,
      body: n.properties?.hs_note_body?.slice(0, 500),
    })),
    ...(emailsRes?.results || []).map((e: any) => ({
      type: "email",
      date: e.properties?.hs_timestamp,
      subject: e.properties?.hs_email_subject,
      direction: e.properties?.hs_email_direction,
      from: e.properties?.hs_email_from_email,
      to: e.properties?.hs_email_to_email,
      body: e.properties?.hs_email_text?.slice(0, 500),
    })),
  ]
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, 150); // keep all; filtering happens in the component so user can adjust the date

  return { company, contacts, deals, activity, closedWonDate };
}

interface HubspotData {
  companyId: string;
  companyName: string;
  company: any;
  contacts: any[];
  deals: any[];
  activity: any[];
  closedWonDate: string | null;
}

interface HandoffDoc {
  companyName?: string; companyDomain?: string; companyContext?: string; industry?: string;
  painPoints?: string[]; useCase?: string;
  keyContacts?: { name: string; title: string; email?: string; phone?: string; role?: string; notes?: string }[];
  dealDetails?: Record<string, string>;
  nextSteps?: string[]; callSummary?: string; fitScore?: number; fitReason?: string;
  hubspotOwner?: string; lastActivity?: string; generatedAt?: string;
  sources?: { hubspot: boolean; transcript: boolean };
}

type Step = "link" | "sync" | "generate";

export function Stage1_Handoff({ workspaceId, onApprove }: { workspaceId: string; onApprove?: () => void }) {
  const [step, setStep] = useState<Step>("link");
  const [approved, setApproved] = useState(false);

  // Step 1 — HubSpot company search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState(""); // what was actually submitted
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [linkedCompany, setLinkedCompany] = useState<{ id: string; name: string; domain?: string } | null>(null);

  // Step 2 — sync
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [hubspotData, setHubspotData] = useState<HubspotData | null>(null);
  const [cutoffDate, setCutoffDate] = useState<string>(""); // YYYY-MM-DD, user-editable
  const [transcripts, setTranscripts] = useState<{ label: string; text: string }[]>([{ label: "", text: "" }]);

  // Step 3 — generate
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState("");
  const [handoff, setHandoff] = useState<HandoffDoc | null>(null);
  const [editHandoff, setEditHandoff] = useState<HandoffDoc | null>(null);
  const [genError, setGenError] = useState("");
  const [activityOpen, setActivityOpen] = useState(false);

  const anthropicKey = (() => { try { return localStorage.getItem("b2br_api_key") || ""; } catch { return ""; } })();
  const hsToken = (() => { try { return localStorage.getItem("b2br_hubspot_token") || ""; } catch { return ""; } })();

  // Load existing workspace HubSpot link + approved handoff
  useEffect(() => {
    if (!supabase || !workspaceId) return;
    supabase.from("workspaces").select("hubspot_company_id, name, raw_data").eq("id", workspaceId).maybeSingle()
      .then(({ data: ws }) => {
        if (ws?.hubspot_company_id && ws?.raw_data?.hubspot) {
          const raw = ws.raw_data.hubspot;
          setLinkedCompany({ id: ws.hubspot_company_id, name: raw.company?.name || ws.name, domain: raw.company?.domain });
          setHubspotData({ companyId: ws.hubspot_company_id, companyName: raw.company?.name || ws.name, ...raw });
          setStep("sync");
        }
      });
    supabase.from("documents").select("content, approved_at, version").eq("workspace_id", workspaceId).eq("type", "handoff")
      .order("version", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => {
        if (data?.content) {
          setHandoff(data.content as HandoffDoc);
          setEditHandoff(data.content as HandoffDoc);
          if (data.approved_at) { setApproved(true); setStep("generate"); }
          else if (data.content) setStep("generate");
        }
      });
  }, [workspaceId]);

  // ── Step 1: Search HubSpot ────────────────────────────────────────────────
  async function searchCompanies() {
    if (!searchQuery.trim()) return;
    if (!hsToken) { setSearchError("No HubSpot token configured. Add it in Settings → API Keys."); return; }
    setSearching(true);
    setSearchError("");
    setSearchResults([]);
    const q = searchQuery.trim();
    setSearchedQuery(q);
    // Use two filterGroups (OR) — CONTAINS_TOKEN for prefix-word match, EQ for exact match
    const res = await hsCall("/crm/v3/objects/companies/search", "POST", {
      filterGroups: [
        { filters: [{ propertyName: "name", operator: "CONTAINS_TOKEN", value: q }] },
        { filters: [{ propertyName: "name", operator: "EQ", value: q }] },
      ],
      properties: ["name", "domain", "industry", "numberofemployees"],
      limit: 10,
    });
    setSearching(false);
    // Surface HubSpot API errors (they return message/category, not error)
    if (res?.error || res?.message || res?.status === "error") {
      setSearchError(res.error || res.message || `HubSpot error (${res?.status})`);
      return;
    }
    setSearchResults(res?.results || []);
    if (!res?.results && !res?.error) {
      // Unexpected response shape — show it for debugging
      setSearchError(`Unexpected response: ${JSON.stringify(res).slice(0, 200)}`);
    }
  }

  async function linkCompany(result: any) {
    const id = result.id;
    const name = result.properties?.name || "Unknown";
    const domain = result.properties?.domain || "";
    setLinkedCompany({ id, name, domain });
    setSearchResults([]);
    // Save to workspace
    if (supabase) {
      await supabase.from("workspaces").update({ hubspot_company_id: id, name }).eq("id", workspaceId);
    }
    setStep("sync");
    syncCompany(id, name);
  }

  // ── Step 2: Sync ──────────────────────────────────────────────────────────
  async function syncCompany(companyId: string, companyName: string) {
    setSyncing(true);
    setSyncError("");
    const result = await syncHubspotCompany(companyId);
    if ((result as any).error) { setSyncError((result as any).error); setSyncing(false); return; }
    const data: HubspotData = { companyId, companyName, ...result };
    setHubspotData(data);
    if (result.closedWonDate) setCutoffDate(result.closedWonDate.slice(0, 10));
    // Persist to workspace raw_data
    if (supabase) {
      await supabase.from("workspaces").update({
        raw_data: { hubspot: { company: result.company, contacts: result.contacts, deals: result.deals, activity: result.activity, closedWonDate: result.closedWonDate } },
        hubspot_synced_at: new Date().toISOString(),
      }).eq("id", workspaceId);
    }
    setSyncing(false);
  }


  // ── Step 3: Generate ──────────────────────────────────────────────────────
  // Filter activity by the user-editable cutoff date.
  // Compare YYYY-MM-DD prefixes directly — avoids all timezone edge cases.
  const filteredActivity = hubspotData?.activity.filter(a => {
    if (!cutoffDate) return true;
    const itemDate = (a.date || "").slice(0, 10); // "2025-03-15"
    return itemDate <= cutoffDate;
  }) ?? [];

  // Combine all transcript blocks into a single string for the AI
  const combinedTranscript = transcripts
    .filter(t => t.text.trim())
    .map((t, i) => t.label.trim() ? `--- ${t.label} ---\n${t.text}` : `--- Call ${i + 1} ---\n${t.text}`)
    .join("\n\n");

  async function generate() {
    if (!hubspotData && !combinedTranscript) { setGenError("Need HubSpot data or a transcript."); return; }
    setGenerating(true); setGenError(""); setHandoff(null); setEditHandoff(null);
    const msgs = ["Reading CRM data…", "Pulling deal context…", "Structuring handoff doc…", "Scoring fit…"];
    let mi = 0; setGenMsg(msgs[mi]);
    const iv = setInterval(() => { mi = (mi + 1) % msgs.length; setGenMsg(msgs[mi]); }, 3500);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/handoff-run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          "x-anthropic-key": anthropicKey,
        },
        body: JSON.stringify({
          hubspotData: hubspotData ? { company: hubspotData.company, contacts: hubspotData.contacts, deals: hubspotData.deals, activity: filteredActivity, closedWonDate: cutoffDate ? new Date(cutoffDate).toISOString() : hubspotData.closedWonDate } : null,
          transcript: combinedTranscript || undefined,
          workspaceId,
        }),
      });
      const data = await res.json();
      if (data.error) { setGenError(data.error); return; }
      setHandoff(data.handoff);
      setEditHandoff(data.handoff);
    } catch (e: any) { setGenError(e.message); } finally { clearInterval(iv); setGenerating(false); setGenMsg(""); }
  }

  async function approveHandoff() {
    if (!supabase || !editHandoff) return;
    const { data: latest } = await supabase.from("documents").select("id").eq("workspace_id", workspaceId).eq("type", "handoff").order("version", { ascending: false }).limit(1).maybeSingle();
    if (latest?.id) await supabase.from("documents").update({ content: editHandoff, approved_at: new Date().toISOString(), approved_by: "CX Team" }).eq("id", latest.id);
    await supabase.from("workspaces").update({ stage: 2, stage_statuses: { "1": "approved" } }).eq("id", workspaceId);
    setApproved(true);
    onApprove?.();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: body }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 10, color: C.accent, fontFamily: mono, fontWeight: 700, letterSpacing: 0.6, marginBottom: 8 }}>STAGE 1</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: head, marginBottom: 6 }}>Sales Handoff</h2>
        <p style={{ fontSize: 13.5, color: C.textSoft, lineHeight: 1.6 }}>
          Link a HubSpot company to pull CRM data, then generate the structured handoff document for the CS team.
        </p>
      </div>

      {/* Approved banner */}
      {approved && (
        <div style={{ background: C.greenLo, border: `1px solid ${C.greenBorder}`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: C.green, fontSize: 16 }}>✓</span>
          <span style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>Handoff approved — Stage 1 complete</span>
          <button onClick={() => setApproved(false)} style={{ marginLeft: "auto", fontSize: 11, color: C.muted, background: "none", border: "none", cursor: "pointer" }}>Edit</button>
        </div>
      )}

      {/* Step indicator */}
      {!approved && (
        <div style={{ display: "flex", gap: 0, marginBottom: 28 }}>
          {[["1", "Link HubSpot"], ["2", "Review & Enrich"], ["3", "Generate"]].map(([num, label], i) => {
            const stepMap: Step[] = ["link", "sync", "generate"];
            const isCurrent = step === stepMap[i];
            const isDone = (i === 0 && (step === "sync" || step === "generate")) || (i === 1 && step === "generate");
            return (
              <div key={num} style={{ display: "flex", alignItems: "center", gap: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px",
                  background: isCurrent ? C.accentLo : "transparent", borderRadius: 8,
                  cursor: isDone ? "pointer" : "default" }}
                  onClick={() => { if (isDone) setStep(stepMap[i]); }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    background: isDone ? C.green : isCurrent ? C.accent : C.surface,
                    border: `2px solid ${isDone ? C.green : isCurrent ? C.accent : C.border}`, fontSize: 10, fontWeight: 800 }}>
                    {isDone ? <span style={{ color: "#fff" }}>✓</span> : <span style={{ color: isCurrent ? "#fff" : C.muted, fontFamily: mono }}>{num}</span>}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: isCurrent ? 700 : 400, color: isCurrent ? C.accent : isDone ? C.text : C.muted, fontFamily: head }}>{label}</span>
                </div>
                {i < 2 && <div style={{ width: 24, height: 1, background: C.border, flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>
      )}

      {/* ── STEP 1: Link HubSpot ── */}
      {step === "link" && (
        <div>
          {!hsToken && (
            <div style={{ background: C.amberLo, border: `1px solid ${C.amberBorder}`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: C.text }}>
              HubSpot token not configured. Add it in Settings → API Keys before linking.
            </div>
          )}
          <div style={{ fontSize: 11, color: C.muted, fontFamily: mono, marginBottom: 8 }}>SEARCH HUBSPOT COMPANIES</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") searchCompanies(); }}
              placeholder="Search by company name…"
              style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 9, padding: "10px 14px",
                fontSize: 13.5, color: C.text, fontFamily: body, outline: "none", background: C.canvas }}
            />
            <button onClick={searchCompanies} disabled={searching || !searchQuery.trim()}
              style={{ padding: "10px 20px", borderRadius: 9, border: "none",
                background: searching || !searchQuery.trim() ? C.muted : C.accent, color: "#fff",
                fontSize: 12.5, fontWeight: 700, fontFamily: head, cursor: searching || !searchQuery.trim() ? "default" : "pointer" }}>
              {searching ? "Searching…" : "Search"}
            </button>
          </div>

          {searchError && <div style={{ fontSize: 13, color: C.red, marginBottom: 12 }}>{searchError}</div>}

          {searchResults.length > 0 && (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              {searchResults.map((r, i) => (
                <div key={r.id} onClick={() => linkCompany(r)}
                  style={{ padding: "12px 16px", borderBottom: i < searchResults.length - 1 ? `1px solid ${C.border}` : "none",
                    cursor: "pointer", transition: "background .1s" }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = C.surface}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = C.canvas}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text, fontFamily: head }}>{r.properties?.name}</div>
                      <div style={{ fontSize: 11.5, color: C.muted, fontFamily: mono, marginTop: 2 }}>
                        {r.properties?.domain || "—"}
                        {r.properties?.industry ? ` · ${r.properties.industry}` : ""}
                        {r.properties?.numberofemployees ? ` · ${Number(r.properties.numberofemployees).toLocaleString()} employees` : ""}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: C.accent, fontFamily: head, fontWeight: 600 }}>Link →</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {searchResults.length === 0 && searchedQuery && !searching && !searchError && (
            <div style={{ fontSize: 13, color: C.muted, textAlign: "center", padding: "20px 0" }}>No companies found for "{searchedQuery}"</div>
          )}
        </div>
      )}

      {/* ── STEP 2: Review sync + optional transcript ── */}
      {step === "sync" && (
        <div>
          {/* Linked company card */}
          {linkedCompany && (
            <div style={{ background: C.accentLo, border: `1px solid ${C.accentBorder}`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: C.canvas, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                🏢
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, fontFamily: head }}>{linkedCompany.name}</div>
                {linkedCompany.domain && <div style={{ fontSize: 11.5, color: C.muted, fontFamily: mono }}>{linkedCompany.domain}</div>}
              </div>
              <button onClick={() => { setStep("link"); setHubspotData(null); setLinkedCompany(null); }}
                style={{ fontSize: 11, color: C.muted, background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: head }}>
                Change
              </button>
              {!syncing && hubspotData && (
                <button onClick={() => syncCompany(linkedCompany.id, linkedCompany.name)}
                  style={{ fontSize: 11, color: C.accent, background: "none", border: `1px solid ${C.accentBorder}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: head, fontWeight: 600 }}>
                  Re-sync
                </button>
              )}
            </div>
          )}

          {syncing && (
            <div style={{ background: C.surface, borderRadius: 10, padding: 20, textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: C.muted, fontFamily: mono }}>Syncing from HubSpot…</div>
            </div>
          )}

          {syncError && <div style={{ fontSize: 13, color: C.red, marginBottom: 16 }}>{syncError}</div>}

          {/* Synced data preview */}
          {hubspotData && !syncing && (
            <>
              <div style={{ background: cutoffDate ? C.greenLo : C.surface, border: `1px solid ${cutoffDate ? C.greenBorder : C.border}`, borderRadius: 8, padding: "8px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: cutoffDate ? C.green : C.muted, fontFamily: head, flexShrink: 0 }}>
                  {cutoffDate ? "✓ Closed Won" : "Activity cutoff date"}
                </span>
                <input
                  type="date"
                  value={cutoffDate}
                  onChange={e => setCutoffDate(e.target.value)}
                  style={{ border: `1px solid ${cutoffDate ? C.greenBorder : C.border}`, borderRadius: 6, padding: "3px 8px",
                    fontSize: 12, color: C.text, background: C.canvas, outline: "none", fontFamily: mono, cursor: "pointer" }}
                />
                <span style={{ fontSize: 11, color: C.muted }}>
                  {cutoffDate
                    ? `${filteredActivity.length} of ${hubspotData.activity.length} activity items included`
                    : "No filter — all activity included"}
                </span>
                {cutoffDate && (
                  <button onClick={() => setCutoffDate("")}
                    style={{ marginLeft: "auto", fontSize: 11, color: C.muted, background: "none", border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontFamily: head }}>
                    Clear
                  </button>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
                <SyncCard icon="👤" label="Contacts" count={hubspotData.contacts.length}
                  items={hubspotData.contacts.slice(0, 3).map(c => `${c.name}${c.title ? ` · ${c.title}` : ""}`)} />
                <SyncCard icon="💼" label="Deals" count={hubspotData.deals.length}
                  items={hubspotData.deals.slice(0, 3).map(d => `${d.name}${d.stage ? ` · ${d.stage}` : ""}`)} />
                <SyncCard icon="📧" label="Emails & Notes" count={filteredActivity.length} total={hubspotData.activity.length}
                  items={filteredActivity.slice(0, 3).map(a => `${a.type === "email" ? a.subject || "Email" : "Note"} · ${a.date ? new Date(a.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}`)} />
              </div>

              {/* Expandable activity log */}
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                <button
                  onClick={() => setActivityOpen(o => !o)}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", background: C.surface, border: "none", cursor: "pointer", fontFamily: head }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                    Activity included in handoff
                    <span style={{ fontWeight: 400, color: C.muted, marginLeft: 6 }}>
                      {filteredActivity.length} item{filteredActivity.length !== 1 ? "s" : ""}
                      {cutoffDate ? ` on or before ${new Date(cutoffDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
                    </span>
                  </span>
                  <span style={{ fontSize: 11, color: C.muted, fontFamily: mono }}>{activityOpen ? "▲" : "▼"}</span>
                </button>

                {activityOpen && (
                  <div style={{ maxHeight: 360, overflowY: "auto" }}>
                    {filteredActivity.length === 0 && (
                      <div style={{ padding: "16px", fontSize: 12, color: C.muted, textAlign: "center" }}>
                        No activity found before this date.
                      </div>
                    )}
                    {filteredActivity.map((a, i) => (
                      <div key={i} style={{ padding: "10px 14px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10 }}>
                        <div style={{ flexShrink: 0, width: 44, textAlign: "center" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, fontFamily: mono, color: a.type === "email" ? C.accent : C.amber }}>
                            {a.type === "email" ? "EMAIL" : "NOTE"}
                          </div>
                          <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, marginTop: 2 }}>
                            {a.date ? new Date(a.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                          </div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {a.type === "email" ? (
                            <>
                              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, fontFamily: head, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {a.subject || "(no subject)"}
                              </div>
                              <div style={{ fontSize: 11, color: C.muted, fontFamily: mono, marginBottom: 3 }}>
                                {a.direction === "INCOMING_EMAIL" ? "↙ Inbound" : "↗ Outbound"}
                                {a.from ? ` · ${a.from}` : ""}
                              </div>
                            </>
                          ) : (
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, fontFamily: head, marginBottom: 2 }}>Note</div>
                          )}
                          {a.body && (
                            <div style={{ fontSize: 11.5, color: C.textSoft, lineHeight: 1.5,
                              display: "-webkit-box" as any, WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any, overflow: "hidden" }}>
                              {a.body}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {cutoffDate && hubspotData.activity.length > filteredActivity.length && (
                      <div style={{ padding: "10px 14px", background: C.amberLo, borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.muted, textAlign: "center" }}>
                        {hubspotData.activity.length - filteredActivity.length} item{hubspotData.activity.length - filteredActivity.length !== 1 ? "s" : ""} after cutoff date — excluded
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Optional transcript enrichment */}
          {hubspotData && !syncing && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: mono, fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>
                CALL TRANSCRIPTS <span style={{ fontWeight: 400, letterSpacing: 0 }}>— optional, enriches the handoff</span>
              </div>

              {transcripts.map((tr, idx) => (
                <div key={idx} style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
                  {/* Card header */}
                  <div style={{ padding: "10px 14px", background: C.surface, display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      value={tr.label}
                      onChange={e => setTranscripts(prev => prev.map((t, i) => i === idx ? { ...t, label: e.target.value } : t))}
                      placeholder={`Call ${idx + 1} label (e.g. "Discovery call – Apr 28")`}
                      style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 10px",
                        fontSize: 12, color: C.text, fontFamily: body, background: C.canvas, outline: "none" }}
                    />
                    {transcripts.length > 1 && (
                      <button
                        onClick={() => setTranscripts(prev => prev.filter((_, i) => i !== idx))}
                        style={{ fontSize: 13, color: C.muted, background: "none", border: `1px solid ${C.border}`,
                          borderRadius: 6, padding: "3px 8px", cursor: "pointer", lineHeight: 1, flexShrink: 0 }}>
                        ×
                      </button>
                    )}
                  </div>

                  {/* Paste area */}
                  <div style={{ padding: 12 }}>
                    <textarea
                      value={tr.text}
                      onChange={e => setTranscripts(prev => prev.map((t, i) => i === idx ? { ...t, text: e.target.value } : t))}
                      placeholder="Paste transcript here…"
                      rows={3}
                      style={{ width: "100%", border: `1px solid ${tr.text ? C.accentBorder : C.border}`, borderRadius: 8,
                        padding: "9px 12px", fontSize: 13, color: C.text, fontFamily: body, lineHeight: 1.6,
                        resize: "vertical", outline: "none", background: C.canvas, boxSizing: "border-box" as const,
                        transition: "border-color .15s" }}
                    />
                    {tr.text && (
                      <div style={{ fontSize: 10.5, color: C.green, fontFamily: mono, marginTop: 4 }}>
                        ✓ {tr.text.length.toLocaleString()} chars
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <button
                onClick={() => setTranscripts(prev => [...prev, { label: "", text: "" }])}
                style={{ fontSize: 12, color: C.accent, background: "none", border: `1px dashed ${C.accentBorder}`,
                  borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontFamily: head, fontWeight: 600, width: "100%" }}>
                + Add Another Transcript
              </button>
            </div>
          )}

          {hubspotData && !syncing && (
            <button onClick={() => { setStep("generate"); generate(); }}
              style={{ padding: "11px 24px", background: C.accent, color: "#fff", border: "none", borderRadius: 8,
                fontSize: 13, fontWeight: 700, fontFamily: head, cursor: "pointer", boxShadow: `0 2px 10px ${C.accent}40` }}>
              Generate Handoff Document →
            </button>
          )}
        </div>
      )}

      {/* ── STEP 3: Generate + review ── */}
      {step === "generate" && (
        <div>
          {/* Sources badge */}
          {editHandoff?.sources && (
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              {editHandoff.sources.hubspot && (
                <span style={{ fontSize: 10, fontWeight: 700, color: C.green, fontFamily: mono, background: C.greenLo, border: `1px solid ${C.greenBorder}`, padding: "3px 8px", borderRadius: 4 }}>
                  ✓ HUBSPOT
                </span>
              )}
              {editHandoff.sources.transcript && (
                <span style={{ fontSize: 10, fontWeight: 700, color: C.accent, fontFamily: mono, background: C.accentLo, border: `1px solid ${C.accentBorder}`, padding: "3px 8px", borderRadius: 4 }}>
                  ✓ TRANSCRIPT
                </span>
              )}
            </div>
          )}

          {generating && (
            <div style={{ background: C.surface, borderRadius: 12, padding: 24, textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: C.muted, fontFamily: mono }}>{genMsg || "Generating…"}</div>
            </div>
          )}
          {genError && <div style={{ fontSize: 13, color: C.red, marginBottom: 16 }}>{genError}</div>}

          {editHandoff && !generating && (
            <>
              {/* Fit score */}
              {editHandoff.fitScore !== undefined && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, background: C.surface, borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ fontSize: 28, fontWeight: 800, fontFamily: mono, color: editHandoff.fitScore >= 8 ? C.green : editHandoff.fitScore >= 5 ? C.amber : C.red }}>{editHandoff.fitScore}/10</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: head }}>Fit Score</div>
                    <div style={{ fontSize: 12, color: C.textSoft }}>{editHandoff.fitReason}</div>
                  </div>
                  {editHandoff.hubspotOwner && (
                    <div style={{ marginLeft: "auto", textAlign: "right" }}>
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: mono }}>OWNER</div>
                      <div style={{ fontSize: 12, color: C.text, fontFamily: head }}>{editHandoff.hubspotOwner}</div>
                    </div>
                  )}
                </div>
              )}

              <Section title="Call Summary"><EditableText value={editHandoff.callSummary || ""} onChange={v => setEditHandoff(p => ({ ...p!, callSummary: v }))} multiline /></Section>
              <Section title="Company Context"><EditableText value={editHandoff.companyContext || ""} onChange={v => setEditHandoff(p => ({ ...p!, companyContext: v }))} multiline /></Section>
              <Section title="Pain Points"><EditableList items={editHandoff.painPoints || []} onChange={v => setEditHandoff(p => ({ ...p!, painPoints: v }))} /></Section>
              <Section title="Use Case"><EditableText value={editHandoff.useCase || ""} onChange={v => setEditHandoff(p => ({ ...p!, useCase: v }))} multiline /></Section>

              {/* Contacts */}
              <Section title="Key Contacts">
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {(editHandoff.keyContacts || []).map((c, i) => (
                    <div key={i} style={{ background: C.surface, borderRadius: 8, padding: "10px 14px" }}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <ContactField label="Name" value={c.name} onChange={v => { const k = [...(editHandoff.keyContacts || [])]; k[i] = { ...k[i], name: v }; setEditHandoff(p => ({ ...p!, keyContacts: k })); }} />
                        <ContactField label="Title" value={c.title} onChange={v => { const k = [...(editHandoff.keyContacts || [])]; k[i] = { ...k[i], title: v }; setEditHandoff(p => ({ ...p!, keyContacts: k })); }} />
                        <ContactField label="Email" value={c.email || ""} onChange={v => { const k = [...(editHandoff.keyContacts || [])]; k[i] = { ...k[i], email: v }; setEditHandoff(p => ({ ...p!, keyContacts: k })); }} />
                        {c.role && <div style={{ display: "flex", alignItems: "center" }}><span style={{ fontSize: 10, color: C.accent, fontFamily: mono, background: C.accentLo, padding: "2px 7px", borderRadius: 4, fontWeight: 700 }}>{c.role.toUpperCase()}</span></div>}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* Deal details */}
              {editHandoff.dealDetails && (
                <Section title="Deal Details">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {Object.entries(editHandoff.dealDetails).filter(([, v]) => v).map(([k, v]) => (
                      <div key={k}>
                        <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>{k.replace(/([A-Z])/g, " $1").toUpperCase()}</div>
                        <input value={v || ""} onChange={e => setEditHandoff(p => ({ ...p!, dealDetails: { ...p!.dealDetails!, [k]: e.target.value } }))}
                          style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 12.5, color: C.text, background: C.canvas, outline: "none", boxSizing: "border-box" as const }} />
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              <Section title="Agreed Next Steps"><EditableList items={editHandoff.nextSteps || []} onChange={v => setEditHandoff(p => ({ ...p!, nextSteps: v }))} /></Section>

              {!approved && (
                <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
                  <button onClick={() => { setHandoff(null); setEditHandoff(null); setStep("sync"); }}
                    style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textSoft, fontSize: 12, fontWeight: 600, fontFamily: head, cursor: "pointer" }}>
                    Re-generate
                  </button>
                  <button onClick={approveHandoff}
                    style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: head, cursor: "pointer", boxShadow: `0 2px 10px ${C.green}40` }}>
                    Approve & Continue →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SyncCard({ icon, label, count, total, items }: { icon: string; label: string; count: number; total?: number; items: string[] }) {
  return (
    <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", overflow: "hidden", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: mono }}>{label.toUpperCase()}</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.accent, fontFamily: mono, marginLeft: "auto", flexShrink: 0 }}>
          {total !== undefined && total !== count ? `${count}/${total}` : count}
        </span>
      </div>
      {items.map((item, i) => (
        <div key={i} style={{ fontSize: 11.5, color: C.textSoft, lineHeight: 1.5, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>• {item}</div>
      ))}
      {count === 0 && <div style={{ fontSize: 11.5, color: C.muted }}>None found</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>{title.toUpperCase()}</div>
      {children}
    </div>
  );
}

function EditableText({ value, onChange, multiline }: { value: string; onChange: (v: string) => void; multiline?: boolean }) {
  const st: React.CSSProperties = { width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, color: C.text, background: C.canvas, outline: "none", fontFamily: body, lineHeight: 1.6, boxSizing: "border-box" };
  return multiline ? <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} style={{ ...st, resize: "vertical" }} /> : <input value={value} onChange={e => onChange(e.target.value)} style={st} />;
}

function EditableList({ items, onChange }: { items: string[]; onChange: (v: string[]) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: C.accent, minWidth: 14 }}>•</span>
          <input value={item} onChange={e => { const n = [...items]; n[i] = e.target.value; onChange(n); }}
            style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 12.5, color: C.text, background: C.canvas, outline: "none" }} />
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} style={{ border: "none", background: "none", cursor: "pointer", color: C.muted, fontSize: 14, padding: "0 4px" }}>×</button>
        </div>
      ))}
      <button onClick={() => onChange([...items, ""])}
        style={{ alignSelf: "flex-start", fontSize: 11, color: C.accent, background: "none", border: `1px dashed ${C.accentBorder}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: head, fontWeight: 600 }}>
        + Add
      </button>
    </div>
  );
}

function ContactField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, letterSpacing: 0.4, marginBottom: 3 }}>{label.toUpperCase()}</div>
      <input value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 9px", fontSize: 12, color: C.text, background: C.canvas, outline: "none", boxSizing: "border-box" as const }} />
    </div>
  );
}
