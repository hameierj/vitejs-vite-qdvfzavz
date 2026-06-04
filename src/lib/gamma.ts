const ADDITIONAL_INSTRUCTIONS = [
  "Do not include any images, photos, or illustrations on any slides. Text only.",
  "The first slide is a cover slide with the company name and tagline.",
  "Each campaign gets its own section. Every campaign section follows the exact same structure in this order: (1) campaign title slide, (2) product/service snapshot, (3) persona snapshot, (4) strategy overview, (5) email sequence slides — one slide per email step with subject line and full body copy, (6) LinkedIn sequence slides — one slide per step with full copy.",
  "Preserve all email and LinkedIn copy exactly as written. Do not summarise or shorten message body text.",
  "Keep a consistent slide layout across all campaign sections: section label at top, slide title below, then content.",
].join(" ");

export const callGammaApi = async (inputText: string, title: string, numCards: number): Promise<string> => {
  const res = await fetch("/api/gamma", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inputText,
      textMode: "preserve",
      format: "presentation",
      numCards,
      title,
      themeId: "dopc0p2lu6c8k7i",
      cardOptions: { dimensions: "16x9" },
      imageOptions: { source: "noImages" },
      additionalInstructions: ADDITIONAL_INSTRUCTIONS,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || data.error || JSON.stringify(data) || `Server error ${res.status}`);
  }
  const { generationId } = await res.json();
  const poll = async (): Promise<string> => {
    const pr = await fetch(`/api/gamma?id=${generationId}`);
    const data = await pr.json();
    if (data.status === "completed") return data.gammaUrl;
    if (data.status === "failed") throw new Error("Gamma generation failed");
    await new Promise(r => setTimeout(r, 5000));
    return poll();
  };
  return poll();
};

export const buildGammaDeck = (
  co: any,
  prods: any[],
  pers: any[],
  grps: any[],
): { text: string; numCards: number } => {
  const L: string[] = [];
  const name = co.co_name || "Company";

  // ── Cover slide ──────────────────────────────────────────────────────────
  L.push(`# ${name}`);
  if (co.co_pitch) L.push(`\n${co.co_pitch}`);
  L.push("");

  // ── One section per campaign ─────────────────────────────────────────────
  let emailStepsTotal = 0;
  let linkedinStepsTotal = 0;

  grps.forEach((g, i) => {
    const prod = prods.find(p => p.name === g.productName) || {};
    const persona = pers.find(p => p.name === g.personaName) || {};
    const pd = persona.data || {};

    L.push(`---`);
    L.push(`\n## Campaign ${i + 1}: ${g.productName} × ${g.personaName}\n`);

    // 1. Product / service snapshot
    L.push(`### Product: ${g.productName}`);
    if (prod.description)      L.push(prod.description);
    if (prod.valueProposition) L.push(`\n**Value proposition:** ${prod.valueProposition}`);
    if (prod.problemsSolved)   L.push(`**Problems solved:** ${prod.problemsSolved}`);
    if (prod.idealCustomer)    L.push(`**Ideal customer:** ${prod.idealCustomer}`);
    if (prod.keyFeatures)      L.push(`**Key features:** ${prod.keyFeatures}`);
    L.push("");

    // 2. Persona snapshot
    L.push(`### Persona: ${g.personaName}`);
    if (pd.buyer)      L.push(`**Job titles:** ${pd.buyer}`);
    if (pd.industries) L.push(`**Industries:** ${Array.isArray(pd.industries) ? pd.industries.join(", ") : pd.industries}`);
    if (pd.co_sizes)   L.push(`**Company size:** ${Array.isArray(pd.co_sizes) ? pd.co_sizes.join(", ") : pd.co_sizes}`);
    if (pd.pain1)      L.push(`**Primary pain:** ${pd.pain1}`);
    if (pd.gain)       L.push(`**Key gain:** ${pd.gain}`);
    if (pd.trigger)    L.push(`**Buying trigger:** ${pd.trigger}`);
    if (pd.objection)  L.push(`**Main objection:** ${pd.objection}`);
    if (pd.rebuttal)   L.push(`**Rebuttal:** ${pd.rebuttal}`);
    L.push("");

    // 3. Strategy overview
    L.push(`### Strategy`);
    if (g.rationale)       L.push(`**Rationale:** ${g.rationale}\n`);
    if (g.emailStrategy)   L.push(`**Email strategy:** ${g.emailStrategy}\n`);
    if (g.linkedinStrategy) L.push(`**LinkedIn strategy:** ${g.linkedinStrategy}`);
    L.push("");

    // 4. Email sequences — full copy
    const emailSeqs: any[][] = g.emailSequences || [(g.emailSequence || [])];
    const seqLabels = ["Email Sequence 1 — Conversation Starter", "Email Sequence 2 — Meeting CTA", "Email Sequence 3 — Value-Based CTA"];
    emailSeqs.forEach((seq, si) => {
      if (!seq?.length) return;
      L.push(`### ${seqLabels[si] || `Email Sequence ${si + 1}`}`);
      seq.forEach((s: any) => {
        emailStepsTotal++;
        L.push(`\n#### Step ${s.stepNumber} — Day +${s.dayOffset}${s.role ? ` (${s.role})` : ""}`);
        if (s.subject) L.push(`**Subject:** ${s.subject}`);
        if (s.body)    L.push(`\n${s.body}`);
      });
      L.push("");
    });

    // 5. LinkedIn sequence — full copy
    if ((g.linkedinSequence || []).length) {
      L.push(`### LinkedIn Sequence`);
      g.linkedinSequence.forEach((s: any) => {
        linkedinStepsTotal++;
        L.push(`\n#### Step ${s.stepNumber} — Day +${s.dayOffset}${s.role ? ` (${s.role})` : ""}`);
        if (s.body) L.push(`\n${s.body}`);
      });
      L.push("");
    }
  });

  // 1 cover + per campaign: 1 title + 1 product + 1 persona + 1 strategy + email steps + linkedin steps
  const numCards = Math.min(75, 1 + grps.length * 4 + emailStepsTotal + linkedinStepsTotal);
  return { text: L.join("\n"), numCards };
};
