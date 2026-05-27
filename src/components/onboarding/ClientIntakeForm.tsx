import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";

const C = {
  bg: "#F8F9FE", canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7",
  text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentBorder: "#6C5CE733",
  green: "#00B894", greenLo: "#00B8940F",
  faint: "#F3F4FB",
};
const head = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

interface IntakeFormData {
  // Business
  businessDescription: string;
  coreProblem: string;
  currentCustomers: string;
  topProofPoints: string;
  competitors: string;
  dealSize: string;
  salesCycle: string;
  // Products
  products: { name: string; category: string; keyFeatures: string; painSolved: string; valueProp: string; timeToValue: string; dealType: string; acv: string }[];
  // Target customers
  targetIndustries: string;
  companySizes: string[];
  buyerTitles: string;
  championRoles: string;
  mainPain: string;
  triggerEvents: string;
  costOfInaction: string;
  // Messaging
  tone: string;
  whatWorked: string;
  exclusions: string;
  goal90day: string;
  websitePermission: string;
  // Optional
  referenceEmails: string;
  notes: string;
}

const SIZE_OPTIONS = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5000+"];
const TONE_OPTIONS = ["Professional & direct", "Conversational & warm", "Data-driven & analytical", "Bold & energetic", "Consultative & thoughtful"];
const DEAL_TYPES = ["One-time project", "Monthly retainer", "Annual SaaS subscription", "Usage-based", "Custom / enterprise"];

function emptyProduct() {
  return { name: "", category: "", keyFeatures: "", painSolved: "", valueProp: "", timeToValue: "", dealType: "", acv: "" };
}

export function ClientIntakeFormPage() {
  const { token } = useParams<{ token: string }>();
  const [workspace, setWorkspace] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<IntakeFormData>({
    businessDescription: "", coreProblem: "", currentCustomers: "", topProofPoints: "",
    competitors: "", dealSize: "", salesCycle: "",
    products: [emptyProduct()],
    targetIndustries: "", companySizes: [], buyerTitles: "", championRoles: "",
    mainPain: "", triggerEvents: "", costOfInaction: "",
    tone: "", whatWorked: "", exclusions: "", goal90day: "", websitePermission: "yes",
    referenceEmails: "", notes: "",
  });

  useEffect(() => {
    if (!token || !supabase) { setNotFound(true); setLoading(false); return; }
    supabase.from("workspaces").select("id, name").eq("share_token", token).single()
      .then(async ({ data, error }) => {
        if (error || !data) { setNotFound(true); setLoading(false); return; }
        setWorkspace(data);
        // Check if already submitted by reading app_data
        try {
          const { data: appRow } = await supabase!.from("app_data").select("value").eq("key", `ws_${data.id}`).single();
          if (appRow?.value?.companyData?._intakeSubmittedAt) setSubmitted(true);
        } catch { /* not submitted yet */ }
        setLoading(false);
      });
  }, [token]);

  const set = (field: keyof IntakeFormData, value: any) => setForm(p => ({ ...p, [field]: value }));

  const toggleSize = (size: string) => {
    setForm(p => ({
      ...p,
      companySizes: p.companySizes.includes(size)
        ? p.companySizes.filter(s => s !== size)
        : [...p.companySizes, size],
    }));
  };

  const setProduct = (i: number, field: string, value: string) => {
    setForm(p => {
      const prods = [...p.products];
      prods[i] = { ...prods[i], [field]: value };
      return { ...p, products: prods };
    });
  };

  const handleSubmit = async () => {
    if (!workspace || !supabase) return;
    setSaving(true);
    try {
      const intakeUpdate = {
        _intakeData: form,
        _intakeSubmittedAt: new Date().toISOString(),
      };

      // Read current workspace data from app_data (main app's key-value store)
      const { data: appDataRow } = await supabase.from("app_data").select("value").eq("key", `ws_${workspace.id}`).single().catch(() => ({ data: null, error: null }));
      const currentWsData = appDataRow?.value || {};
      const merged = {
        ...currentWsData,
        companyData: {
          ...(currentWsData.companyData || {}),
          ...intakeUpdate,
        },
      };

      // Save to app_data (main app reads this on sync)
      await supabase.from("app_data").upsert({ key: `ws_${workspace.id}`, value: merged }, { onConflict: "key" });

      setSubmitted(true);
    } catch (e) {
      console.error("Intake form save failed:", e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: head }}>
        <div style={{ fontSize: 14, color: C.muted }}>Loading…</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: head }}>
        <div style={{ textAlign: "center" as const, maxWidth: 400 }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>🔍</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Form not found</div>
          <div style={{ fontSize: 14, color: C.muted }}>This intake form link is invalid or has expired. Contact your B2B Rocket CSM for a new link.</div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: head }}>
        <div style={{ textAlign: "center" as const, maxWidth: 440, padding: 32 }}>
          <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#00B8940F", border: "2px solid #00B894", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, margin: "0 auto 20px" }}>✓</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 10 }}>Intake form submitted!</div>
          <div style={{ fontSize: 14, color: C.textSoft, lineHeight: 1.7 }}>
            Thank you for completing the onboarding intake. Your B2B Rocket CSM will review your answers and be in touch shortly with next steps.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: head }}>
      {/* Header */}
      <div style={{ background: C.canvas, borderBottom: `1px solid ${C.border}`, padding: "16px 24px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 800 }}>B</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>B2B Rocket — Client Onboarding</div>
            <div style={{ fontSize: 12, color: C.muted }}>{workspace?.name}</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px 64px" }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: C.text, margin: "0 0 8px" }}>Onboarding Intake Form</h1>
          <p style={{ fontSize: 14, color: C.textSoft, margin: 0, lineHeight: 1.7 }}>
            This helps our team understand your business, products, and target customers so we can build highly personalized outreach campaigns. Takes about 10–15 minutes.
          </p>
        </div>

        {/* Section 1: About Your Business */}
        <Section title="About Your Business" num={1}>
          <FQ label="What does your company do? (plain English — no jargon)" required>
            <Textarea value={form.businessDescription} onChange={v => set("businessDescription", v)} rows={3} placeholder="We help [buyer] do [outcome] by [mechanism]…" />
          </FQ>
          <FQ label="What specific problem do you solve for your customers?" required>
            <Textarea value={form.coreProblem} onChange={v => set("coreProblem", v)} rows={2} placeholder="The core pain your solution addresses…" />
          </FQ>
          <FQ label="Who are your current best customers? (company types, industries, or specific names)">
            <Textarea value={form.currentCustomers} onChange={v => set("currentCustomers", v)} rows={2} placeholder="e.g. SaaS companies with 50-500 employees, e-commerce brands, healthcare staffing firms…" />
          </FQ>
          <FQ label="What are your 3 strongest proof points or case study results?">
            <Textarea value={form.topProofPoints} onChange={v => set("topProofPoints", v)} rows={3} placeholder="1. [Client type] achieved [specific result] in [timeframe]\n2. …\n3. …" />
          </FQ>
          <TwoCol>
            <FQ label="Who are your main competitors?">
              <Input value={form.competitors} onChange={v => set("competitors", v)} placeholder="Company A, Company B…" />
            </FQ>
            <FQ label="Average deal size">
              <Input value={form.dealSize} onChange={v => set("dealSize", v)} placeholder="e.g. $5,000–$20,000 / year" />
            </FQ>
          </TwoCol>
          <FQ label="Average sales cycle length">
            <Input value={form.salesCycle} onChange={v => set("salesCycle", v)} placeholder="e.g. 2–4 weeks" />
          </FQ>
        </Section>

        {/* Section 2: Products/Services */}
        <Section title="Your Products / Services" num={2}>
          <p style={{ fontSize: 13, color: C.textSoft, margin: "0 0 16px", lineHeight: 1.6 }}>
            Fill out one entry per product or service line. Add more with the button below.
          </p>
          {form.products.map((p, i) => (
            <div key={i} style={{ background: C.faint, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontFamily: mono, fontWeight: 700, color: C.muted, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
                  Product / Service {i + 1}
                </div>
                {form.products.length > 1 && (
                  <button onClick={() => setForm(prev => ({ ...prev, products: prev.products.filter((_, j) => j !== i) }))}
                    style={{ fontSize: 11, color: C.muted, background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}>Remove</button>
                )}
              </div>
              <TwoCol>
                <FQ label="Product/Service Name" required>
                  <Input value={p.name} onChange={v => setProduct(i, "name", v)} placeholder="e.g. Sales Acceleration Program" />
                </FQ>
                <FQ label="Category">
                  <Input value={p.category} onChange={v => setProduct(i, "category", v)} placeholder="e.g. B2B SaaS, Consulting, Staffing" />
                </FQ>
              </TwoCol>
              <FQ label="Key Features (3 bullet points)">
                <Textarea value={p.keyFeatures} onChange={v => setProduct(i, "keyFeatures", v)} rows={2} placeholder="• Feature 1\n• Feature 2\n• Feature 3" />
              </FQ>
              <TwoCol>
                <FQ label="Main pain it solves">
                  <Textarea value={p.painSolved} onChange={v => setProduct(i, "painSolved", v)} rows={2} placeholder="The problem before…" />
                </FQ>
                <FQ label="Value proposition">
                  <Textarea value={p.valueProp} onChange={v => setProduct(i, "valueProp", v)} rows={2} placeholder="The result after…" />
                </FQ>
              </TwoCol>
              <TwoCol>
                <FQ label="Time to value">
                  <Input value={p.timeToValue} onChange={v => setProduct(i, "timeToValue", v)} placeholder="e.g. 30 days, 3 months" />
                </FQ>
                <FQ label="Deal type">
                  <Select value={p.dealType} onChange={v => setProduct(i, "dealType", v)} options={DEAL_TYPES} placeholder="Select…" />
                </FQ>
              </TwoCol>
              <FQ label="Average contract value">
                <Input value={p.acv} onChange={v => setProduct(i, "acv", v)} placeholder="e.g. $12,000/year, $2,500/month" />
              </FQ>
            </div>
          ))}
          <button onClick={() => setForm(p => ({ ...p, products: [...p.products, emptyProduct()] }))}
            style={{ width: "100%", padding: "10px", borderRadius: 8, border: `1px dashed ${C.border}`,
              background: "transparent", color: C.muted, fontSize: 13, fontFamily: head, cursor: "pointer" }}>
            + Add Another Product / Service
          </button>
        </Section>

        {/* Section 3: Target Customers */}
        <Section title="Your Target Customers" num={3}>
          <FQ label="What industries do you primarily target?" required>
            <Input value={form.targetIndustries} onChange={v => set("targetIndustries", v)} placeholder="e.g. B2B SaaS, Healthcare, Manufacturing, Financial Services" />
          </FQ>
          <FQ label="What company sizes? (select all that apply)">
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8, marginTop: 4 }}>
              {SIZE_OPTIONS.map(s => (
                <button key={s} onClick={() => toggleSize(s)}
                  style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${form.companySizes.includes(s) ? C.accent : C.border}`,
                    background: form.companySizes.includes(s) ? C.accentLo : "transparent",
                    color: form.companySizes.includes(s) ? C.accent : C.textSoft,
                    fontSize: 12, fontFamily: head, cursor: "pointer", fontWeight: form.companySizes.includes(s) ? 700 : 500 }}>
                  {s} employees
                </button>
              ))}
            </div>
          </FQ>
          <TwoCol>
            <FQ label="What job titles sign the check? (decision makers)" required>
              <Textarea value={form.buyerTitles} onChange={v => set("buyerTitles", v)} rows={2} placeholder="VP Sales, CEO, Head of Marketing…" />
            </FQ>
            <FQ label="Who champions your product internally?">
              <Textarea value={form.championRoles} onChange={v => set("championRoles", v)} rows={2} placeholder="Sales ops manager, Marketing coordinator…" />
            </FQ>
          </TwoCol>
          <FQ label="What's the main pain your best customers had before finding you?" required>
            <Textarea value={form.mainPain} onChange={v => set("mainPain", v)} rows={2} placeholder="The frustrating problem they were trying to solve…" />
          </FQ>
          <FQ label="What triggers a prospect to start looking for a solution like yours?">
            <Textarea value={form.triggerEvents} onChange={v => set("triggerEvents", v)} rows={2} placeholder="Hiring a new VP, launching a new product, hitting a growth plateau, losing a key deal…" />
          </FQ>
          <FQ label="What's the cost if they do nothing? (business impact of inaction)">
            <Textarea value={form.costOfInaction} onChange={v => set("costOfInaction", v)} rows={2} placeholder="Continued revenue leakage, competitor advantage, team burnout…" />
          </FQ>
        </Section>

        {/* Section 4: Messaging */}
        <Section title="Messaging & Campaign Preferences" num={4}>
          <FQ label="What tone resonates best with your buyers?">
            <Select value={form.tone} onChange={v => set("tone", v)} options={TONE_OPTIONS} placeholder="Select tone…" />
          </FQ>
          <FQ label="What has worked in outreach before? (emails, angles, subject lines that got replies)">
            <Textarea value={form.whatWorked} onChange={v => set("whatWorked", v)} rows={3} placeholder="Any messages, hooks, or approaches that generated responses…" />
          </FQ>
          <FQ label="Any companies, industries, or roles to exclude from outreach?">
            <Input value={form.exclusions} onChange={v => set("exclusions", v)} placeholder="e.g. Direct competitors, existing clients, specific industries…" />
          </FQ>
          <FQ label="What's your main goal for this outreach program in the first 90 days?" required>
            <Input value={form.goal90day} onChange={v => set("goal90day", v)} placeholder="e.g. 15 qualified meetings per month, 3 new enterprise deals" />
          </FQ>
          <FQ label="Can we reference your company website and brand name in outreach copy?">
            <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
              {["yes", "no", "with_approval"].map(v => (
                <button key={v} onClick={() => set("websitePermission", v)}
                  style={{ padding: "7px 16px", borderRadius: 7, border: `1px solid ${form.websitePermission === v ? C.accent : C.border}`,
                    background: form.websitePermission === v ? C.accentLo : "transparent",
                    color: form.websitePermission === v ? C.accent : C.textSoft,
                    fontSize: 12.5, fontFamily: head, cursor: "pointer", fontWeight: form.websitePermission === v ? 700 : 500 }}>
                  {v === "yes" ? "Yes" : v === "no" ? "No" : "With approval"}
                </button>
              ))}
            </div>
          </FQ>
        </Section>

        {/* Section 5: Optional */}
        <Section title="Optional — Reference Materials" num={5} optional>
          <FQ label="Paste any outreach emails that have gotten good responses for you in the past">
            <Textarea value={form.referenceEmails} onChange={v => set("referenceEmails", v)} rows={5} placeholder="Paste one or more email examples here…" />
          </FQ>
          <FQ label="Anything else we should know about your company, customers, or goals?">
            <Textarea value={form.notes} onChange={v => set("notes", v)} rows={3} placeholder="Additional context, constraints, or information…" />
          </FQ>
        </Section>

        {/* Submit */}
        <div style={{ marginTop: 32, padding: 24, background: C.canvas, borderRadius: 12, border: `1px solid ${C.border}`, textAlign: "center" as const }}>
          <div style={{ fontSize: 14, color: C.textSoft, marginBottom: 16, lineHeight: 1.6 }}>
            By submitting this form, your answers will be shared with your B2B Rocket CSM to personalize your campaign strategy.
          </div>
          <button onClick={handleSubmit} disabled={saving || !form.businessDescription || !form.goal90day}
            style={{ padding: "12px 32px", borderRadius: 9, border: "none",
              background: (saving || !form.businessDescription || !form.goal90day) ? C.faint : C.accent,
              color: (saving || !form.businessDescription || !form.goal90day) ? C.muted : "#fff",
              fontSize: 14, fontWeight: 700, fontFamily: head, cursor: saving ? "wait" : "pointer",
              boxShadow: (!saving && form.businessDescription && form.goal90day) ? `0 2px 12px ${C.accent}40` : "none" }}>
            {saving ? "Submitting…" : "Submit Intake Form"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Form helpers ─────────────────────────────────────────────────────────────

function Section({ title, num, children, optional }: { title: string; num: number; children: React.ReactNode; optional?: boolean }) {
  return (
    <div style={{ marginBottom: 32, paddingBottom: 32, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.accentLo, border: `1px solid ${C.accentBorder}`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: C.accent, fontFamily: mono, flexShrink: 0 }}>
          {num}
        </div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>{title}</h2>
        {optional && <span style={{ fontSize: 11, color: C.muted, background: C.faint, padding: "2px 8px", borderRadius: 4 }}>Optional</span>}
      </div>
      {children}
    </div>
  );
}

function FQ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>
        {label}{required && <span style={{ color: C.accent, marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function Textarea({ value, onChange, rows, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows || 3} placeholder={placeholder}
      style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
        fontSize: 13, fontFamily: head, color: C.text, background: C.canvas, outline: "none",
        resize: "vertical" as const, lineHeight: 1.6, boxSizing: "border-box" as const }} />
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
        fontSize: 13, fontFamily: head, color: C.text, background: C.canvas, outline: "none",
        boxSizing: "border-box" as const }} />
  );
}

function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
        fontSize: 13, fontFamily: head, color: value ? C.text : C.muted, background: C.canvas, outline: "none",
        appearance: "none" as const, backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%238E94A7' stroke-width='1.5' fill='none'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}>
      <option value="">{placeholder || "Select…"}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function TwoCol({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {children}
    </div>
  );
}
