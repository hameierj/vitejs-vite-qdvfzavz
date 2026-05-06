// Schema definitions shared between App.tsx and portal components

export const PRODUCT_SECTIONS: Record<string, {label:string; fields:any[]}> = {
  core: { label:"Core Details", fields:[
    { id:"name",              label:"Product / Service Name",   type:"text",     ph:"",                                                   required:true, noConf:true },
    { id:"description",       label:"Description",              type:"textarea", ph:"What is it and how does it work?",                    rows:3 },
    { id:"category",          label:"Category",                 type:"select",   opts:["Software","Platform","Service","Hardware","Consulting","Marketplace","Other"], noConf:true },
    { id:"useCases",          label:"Use Cases",                type:"textarea", ph:"Scenario 1: Mid-market teams replacing manual spreadsheet tracking\nScenario 2: Enterprise orgs consolidating 3+ tools into one", rows:4, hint:"Specific scenarios where this product applies — feeds into outreach copy angles" },
    { id:"keyFeatures",       label:"Key Features / Capabilities", type:"textarea", ph:"Feature 1: Real-time dashboard with 50+ metrics\nFeature 2: One-click integrations with Salesforce, HubSpot\nFeature 3: AI-powered lead scoring", rows:4, hint:"Concrete features — these become proof points in email copy" },
    { id:"problemsSolved",    label:"Problems It Solves",       type:"textarea", ph:"What specific pain points does this address? Be concrete — not 'saves time' but 'eliminates 8hrs/week of manual data entry'.", rows:4, hint:"The more specific, the better the outreach copy" },
    { id:"valueProposition",  label:"Value Proposition",        type:"textarea", ph:"Why should someone buy this instead of alternatives?", rows:3, hint:"The core promise — must be differentiated" },
    { id:"timeToValue",       label:"Implementation / Time to Value", type:"textarea", ph:"Live in 2 weeks with full onboarding. No engineering required. See ROI within 30 days.", rows:2, hint:"Speed to value is a key differentiator — use in copy when fast" },
  ]},
  market: { label:"Market Fit", fields:[
    { id:"idealCustomer",     label:"Ideal Customer",           type:"textarea", ph:"What type of company/person is the perfect buyer?",   rows:3, hint:"Industry, size, role, situation" },
    { id:"marketMaturity",    label:"Market Maturity",          type:"select",   opts:["Established category — buyers know what this is","Emerging category — some education needed","New category — significant education required","Replacing an existing behavior (not a tool)"], noConf:true, hint:"Changes entire messaging approach — known categories sell differently than new ones" },
    { id:"competitors",       label:"Competitive Alternatives", type:"textarea", ph:"Who do prospects compare you to? Include the status quo (doing nothing).", rows:3, hint:"Both direct competitors and 'we'll just keep doing it manually'" },
    { id:"buyerObjections",   label:"Buyer Objections (product-level)", type:"textarea", ph:"'Too expensive for what it does'\n'Missing feature X that competitor has'\n'Security/compliance concerns'\n'We'd need to migrate data'", rows:4, hint:"Product-specific objections — different from persona objections. Critical for reply handlers" },
    { id:"switchTriggers",    label:"What Makes Them Switch",   type:"textarea", ph:"What events or frustrations cause them to look for a new solution?", rows:2 },
  ]},
  commercials: { label:"Commercials", fields:[
    { id:"dealType",          label:"Deal Type",                type:"select",   opts:["Recurring (subscription / retainer)","One-Time (project / purchase)","Both — recurring and one-time options"], noConf:true, hint:"Determines which financial fields are relevant and how AI frames value" },
    // Recurring fields
    { id:"acv",               label:"Average Contract Value (ACV)", type:"text", ph:"$24,000/year",                                       hint:"Annual contract value — the number that sizes the deal in outreach", showWhen:"recurring" },
    { id:"mrr",               label:"Monthly Recurring Revenue per Deal", type:"text", ph:"$2,000/mo",                                    hint:"MRR per customer — different messaging for $500/mo vs $5K/mo", showWhen:"recurring" },
    { id:"contractLength",    label:"Typical Contract Length",  type:"select",   opts:["Month-to-month","Quarterly","6 months","Annual","Multi-year","Custom"], noConf:true, showWhen:"recurring" },
    { id:"renewalRate",       label:"Renewal / Retention Rate", type:"text",     ph:"92% annual renewal",                                  hint:"Retention rate — feeds upsell campaign messaging and trust signals", showWhen:"recurring" },
    { id:"expansionRevenue",  label:"Expansion / Upsell Rate", type:"text",     ph:"35% of customers upgrade within 6 months",            hint:"Net revenue retention — shows growth potential in ROI pitch", showWhen:"recurring" },
    { id:"ltv",               label:"Customer Lifetime Value (LTV)", type:"text",ph:"$72,000 over 3 years",                               hint:"LTV justifies acquisition cost — AI uses this in value framing", showWhen:"recurring" },
    // One-time fields
    { id:"avgDealSize",       label:"Average Deal Size",        type:"text",     ph:"$15,000 per project",                                 hint:"Typical one-time deal value — feeds pipeline projections", showWhen:"onetime" },
    { id:"repeatRate",        label:"Repeat Purchase Rate",     type:"text",     ph:"40% come back within 12 months",                     hint:"How often one-time buyers return — changes follow-up strategy", showWhen:"onetime" },
    { id:"referralRate",      label:"Referral Rate",            type:"text",     ph:"25% of deals come from referrals",                   hint:"If high, AI can incorporate referral asks into post-sale sequences", showWhen:"onetime" },
    // Shared fields
    { id:"avgDaysToClose",    label:"Average Days to Close",    type:"text",     ph:"28 days from first touch",                            hint:"Exact number feeds follow-up cadence timing in playbooks" },
    { id:"closeRateByStage",  label:"Close Rate by Stage",      type:"textarea", ph:"Lead → Demo: 25%\nDemo → Proposal: 60%\nProposal → Close: 40%\nOverall: 6%", rows:3, hint:"Stage-by-stage conversion — more useful than a single win rate" },
    { id:"dealStakeholders",  label:"Typical Deal Stakeholders", type:"textarea", ph:"1 champion (ops manager)\n1 decision maker (VP/C-level)\n1 blocker (IT/security)\nAvg 2-3 people involved", rows:3, hint:"Number and type of people involved — changes messaging depth and multi-threading strategy" },
    { id:"discountAuthority", label:"Discount / Flexibility",   type:"textarea", ph:"Reps can offer: 10% annual discount, free trial (14 days), extended payment terms\nManager approval needed for: 20%+ discount, custom contracts\nNever discount: implementation fees", rows:3, hint:"What can be offered to close — AI uses this in closing sequences and objection handling" },
    { id:"paymentTerms",      label:"Payment Terms / Options",  type:"textarea", ph:"Net 30, credit card accepted, annual prepay (2 months free), quarterly billing available", rows:2, hint:"Payment flexibility can be a closing lever — AI references this when price is an objection" },
  ]},
  proof: { label:"Proof & Evidence", fields:[
    { id:"proofPoints",       label:"Best Proof Points",        type:"textarea", ph:"'3x pipeline in 90 days for Acme Corp' — specific results, stats, logos.", rows:3, hint:"One strong proof > five vague claims" },
    { id:"roiMetrics",        label:"ROI / Outcome Metrics",    type:"textarea", ph:"Average 3.2x ROI within 6 months\nSaves 12 hrs/week per rep\nReduces cost-per-lead by 40%\n85% faster onboarding", rows:3, hint:"Specific numbers AI uses for data-driven hooks and value justification" },
    { id:"caseStudies",       label:"Case Studies",             type:"textarea", ph:"Customer name, problem they had, what you did, result achieved.",  rows:4, hint:"Story format: situation → solution → result" },
    { id:"industryProof",     label:"Industry-Specific Proof",  type:"textarea", ph:"SaaS: 'Used by 200+ SaaS companies including [logos]'\nHealthcare: 'HIPAA compliant, deployed at 3 hospital networks'\nConstruction: '500+ contractors use this daily'", rows:4, hint:"Proof mapped per vertical — a SaaS logo means nothing to construction buyers" },
    { id:"socialProof",       label:"Social Proof",             type:"textarea", ph:"G2 rating, awards, press mentions, number of customers.",  rows:2 },
    { id:"objectionRebuttals",label:"Objection Rebuttals",      type:"textarea", ph:"'Too expensive' → Show ROI calc: pays for itself in 2 months\n'Missing feature X' → Roadmap commitment + workaround\n'Security concerns' → SOC2 cert + encryption details", rows:4, hint:"When they say X, we show Y — bridges proof to displacement" },
    { id:"unsolvedImpact",    label:"What Happens If Unsolved",   type:"textarea", ph:"Agencies can't scale beyond billable human hours\nMillions a year left on the table\nCompetitors gain data advantage", rows:3, hint:"The cost of inaction — use for urgency messaging in outreach" },
  ]},
  positioning: { label:"Positioning & Messaging", fields:[
    { id:"elevatorPitch",     label:"Elevator Pitch (30 sec)",  type:"textarea", ph:"[Product] helps [audience] [achieve outcome] by [how it works], without [key friction they hate].", rows:2, hint:"Forced brevity — feeds subject lines and LinkedIn intros" },
    { id:"positioningStatement", label:"Positioning Statement", type:"textarea", ph:"For [target audience] who [need/pain], [product] is a [category] that [key benefit], unlike [alternatives] which [limitation].", rows:3, hint:"Classic positioning framework — keeps all messaging aligned" },
    { id:"messagingDos",      label:"Messaging Do's",           type:"textarea", ph:"Lead with speed/simplicity angle\nAlways mention the free trial\nUse customer names when possible", rows:3, hint:"Product-specific messaging rules — separate from company-level guardrails" },
    { id:"messagingDonts",    label:"Messaging Don'ts",         type:"textarea", ph:"Never compare directly to [competitor] by name\nDon't mention pricing in cold outreach\nAvoid technical jargon — buyers aren't engineers", rows:3, hint:"Product-specific things to avoid in copy" },
  ]},
  notes: { label:"Notes", fields:[
    { id:"prod_notes", label:"Additional Notes", type:"textarea", ph:"Anything specific about this product that AI should know — seasonal availability, technical prerequisites, pricing nuances, etc.", rows:4, noConf:true, aiFill:false },
  ]},
};

export const ICP_SECTIONS: Record<string, {label:string; icon?:string; fields:any[]}> = {
  targeting: { label:"Targeting", icon:"◎",
    fields:[
      { id:"industries", label:"Target Industries",          type:"textarea", ph:"B2B SaaS, Healthcare IT, Manufacturing…", rows:2, hint:"Specific verticals — not just \'tech\' or \'enterprise\'" },
      { id:"co_sizes",   label:"Company Size",               type:"chips",    opts:["SMB 1–50","Mid-Market 51–500","Enterprise 500+"] },
      { id:"geo",        label:"Geographies",                type:"text",     ph:"North America, UK, DACH, ANZ…" },
      { id:"revenue",    label:"Revenue Range",              type:"text",     ph:"$5M–$50M, or 'Any'", hint:"Target company revenue range" },
      { id:"tech",       label:"Tech Stack Signals",         type:"textarea", ph:"Uses Salesforce, HubSpot, SAP, Workday…", rows:2, hint:"Tools they use that indicate they\'re a fit" },
      { id:"keywords",   label:"Search Keywords",            type:"textarea", ph:"Terms that indicate fit — job post keywords, tech mentions, industry jargon.", rows:2, hint:"Keywords used to find and qualify prospects" },
      { id:"dream_accts",label:"Dream Accounts",             type:"textarea", ph:"Specific companies you\'d love to land — names, websites, LinkedIn URLs.", rows:2, hint:"Helps define the ideal profile for lookalike targeting" },
      { id:"neg",        label:"Exclude Within Segment",     type:"textarea", ph:"Sub-types that churn or aren\'t a fit.", rows:2 },
      { id:"intent_topics", label:"Intent Topics",             type:"textarea", ph:"Equipment financing, equipment leasing, construction loans, same day funding, quick business funding…", rows:2, hint:"Intent signals used for list building — what prospects are actively searching/engaging with" },
      { id:"real_filters",  label:"Actual Targeting Filters",  type:"textarea", ph:"Industry: Construction\nEmployees: 1–50\nTitles: Owner, Founder, CEO, CFO\nLocation: US\nIntent: equipment financing, equipment leasing", rows:4, hint:"Paste the real filters being used for prospecting — the ICP will be refined to match these exactly", noConf:true },
    ]
  },
  persona: { label:"Persona", icon:"◑",
    fields:[
      { id:"buyer",      label:"Primary Buyer Title(s)",          type:"textarea", ph:"VP of Sales, CRO, Head of Revenue Operations…", rows:2, hint:"Who signs the check or strongly influences the purchase" },
      { id:"champ",      label:"Champion / Influencer",           type:"text",     ph:"Sales Ops Manager, RevOps Lead…", hint:"Who gets excited first and sells it internally" },
      { id:"goals",      label:"What this buyer cares about most",type:"textarea", ph:"Hitting quota, reducing ramp time, demonstrating ROI…", rows:2 },
      { id:"fears",      label:"What keeps them up at night",     type:"textarea", ph:"Missing number, churn spike, losing headcount…", rows:2 },
      { id:"metrics",    label:"How they\'re measured",          type:"text",     ph:"ARR attainment, pipeline coverage, win rate…" },
      { id:"objections", label:"Objections they always raise",    type:"textarea", ph:"\'We already use X.\' \'No budget until Q3.\'", rows:2 },
      { id:"sub_personas", label:"Persona Variants",              type:"textarea", ph:"Owner/Operator: cares about jobs, crews, timelines, revenue, family\nFinance/Accounting: cares about cash flow, structure, predictable payments, capital control", rows:4, hint:"Define 2–3 sub-personas within this ICP — each gets tailored messaging angles" },
    ]
  },
  pains: { label:"Pains & Triggers", icon:"◐",
    fields:[
      { id:"pain1",    label:"Primary Pain — Lead With This",   type:"textarea", ph:"The single most painful, specific problem before finding you.", rows:3, hint:"This opens every cold email. Vague doesn\'t work here." },
      { id:"pain2",    label:"Supporting Pain Points",          type:"textarea", ph:"2–3 other frustrations that compound the primary pain.", rows:2 },
      { id:"gains",    label:"Gains — What They Want Instead",  type:"textarea", ph:"Take on more jobs, increase productivity, win more bids, preserve cash, get fast financing…", rows:2, hint:"The ideal outcomes they\'re chasing — mirror image of pains" },
      { id:"triggers", label:"Trigger Events — Buying Intent",  type:"textarea", ph:"Series B closed, new CRO hired, missed Q2, expanding geo…", rows:3, hint:"What happens right before they\'d be ready to buy?" },
      { id:"buying_signals_direct", label:"Direct Buying Signals", type:"textarea", ph:"Searching pricing pages, requesting demos, issuing RFPs, evaluating competitors…", rows:2, hint:"Observable behavior showing active purchase intent" },
      { id:"buying_signals_indirect", label:"Indirect Buying Signals", type:"textarea", ph:"New hire in key role, tech stack change, funding round, seasonal ramp…", rows:2, hint:"Signals suggesting emerging need but not yet active shopping" },
      { id:"sq_cost",  label:"Cost of Doing Nothing",           type:"textarea", ph:"In dollars, time, or risk — what does inaction cost them per quarter?", rows:2 },
      { id:"friction_points", label:"Friction Points — What Makes Them Hesitate", type:"textarea", ph:"Long procurement, need multiple sign-offs, risk-averse culture, existing vendor lock-in…", rows:2, hint:"Structural barriers to buying — different from objections" },
    ]
  },
  messaging: { label:"Messaging", icon:"◒",
    fields:[
      { id:"tone",      label:"Tone",                           type:"select",   opts:["Consultative & Educational","Direct & Punchy","Casual & Conversational","Formal & Executive","Data-driven & Analytical","Blue Collar & Human","Blunt & Edgy","Confrontational"] },
      { id:"hook",      label:"Opening Hook That Gets Replies", type:"textarea", ph:"The specific angle that works for THIS profile. Not generic.", rows:2 },
      { id:"cta",       label:"CTA Style",                      type:"select",   opts:["15-min call ask","Soft permission (\'worth a chat?\')","Video/resource share","Direct demo ask","Open-ended question","Easy yes/no reply","Direct callback ask"] },
      { id:"why_client_wins", label:"Why Client Wins for This ICP", type:"textarea", ph:"We win because of speed, flexibility, human process — better fit than banks for messy finances…", rows:2, hint:"Why your client specifically beats alternatives for THIS ICP" },
      { id:"icp_proof", label:"Best Proof for This ICP",        type:"textarea", ph:"Which case study, logo, or stat lands hardest for this audience?", hint:"One targeted proof point beats five generic ones" },
      { id:"ref_emails",label:"Reference Email Copy (manual)",   type:"textarea", ph:"Paste examples of emails that have worked well for this audience — subject lines and body. AI won't fill this — paste your own.", rows:4, hint:"User-provided only. Paste proven emails so AI can match the style when generating sequences.", noConf:true, aiFill:false },
      { id:"seq_strategy", label:"Sequence Strategy",           type:"textarea", ph:"e.g., Start with pain-focused hook, follow with proof, escalate urgency, end with breakup", rows:2, hint:"How should the email sequence flow? Single narrative, multi-angle, escalating?", noConf:true },
      { id:"seq_cta_style",label:"CTA Variation",               type:"text",     ph:"e.g., Soft ask first, escalate to direct demo ask by step 3", hint:"Same CTA throughout or escalating commitment?", noConf:true },
    ]
  },
  competitorIntel: { label:"Competitor Intel", icon:"⊘",
    fields:[
      { id:"current_solutions",      label:"What THIS Buyer Currently Uses",    type:"textarea", ph:"Salesforce + manual spreadsheets, incumbent vendor X, in-house solution…", rows:3, hint:"The specific tools/vendors THIS persona uses — different from company-level Market Competitors in the Company Profile" },
      { id:"incumbent_strengths",    label:"Why They Stay With the Incumbent",  type:"textarea", ph:"Familiarity, sunk cost, integration with other tools, risk aversion…", rows:2, hint:"Understanding this helps craft displacement messaging" },
      { id:"switching_triggers",     label:"Switching Triggers",                type:"textarea", ph:"Contract renewal, price increase, key feature missing, new leadership, compliance requirement…", rows:3, hint:"Events that make them willing to evaluate alternatives" },
      { id:"displacement_messaging", label:"Displacement Messaging",           type:"textarea", ph:"How to position against their current tool — not bashing, but highlighting gaps they feel.", rows:3, hint:"'If you're using X, you're probably dealing with Y problem. We solve that by…'" },
      { id:"win_loss_patterns",      label:"Win/Loss Patterns",                type:"textarea", ph:"We win when: they need speed. We lose when: they want enterprise compliance.", rows:2, hint:"Why have past deals been won or lost against this competitor?" },
    ]
  },
  channelBehavior: { label:"Channel Behavior", icon:"⊕",
    fields:[
      { id:"best_channel",        label:"Best Outreach Channel",    type:"select",   opts:["Email","LinkedIn","Phone","Multi-channel (Email + LinkedIn)","Multi-channel (All)"], noConf:true },
      { id:"best_time",           label:"Best Time to Reach",       type:"text",     ph:"Tuesday-Thursday 9-11am EST",                       hint:"Industry-specific — construction = early morning, SaaS = mid-morning" },
      { id:"linkedin_activity",   label:"LinkedIn Activity Level",  type:"select",   opts:["Very Active (posts/comments weekly)","Moderate (engages occasionally)","Low (profile exists, rarely active)","Inactive / No profile"], noConf:true },
      { id:"phone_accessibility", label:"Phone Accessibility",      type:"select",   opts:["Direct dial available","Mobile available","Gatekeeper (assistant)","Voicemail only","Not available / don't call"], noConf:true },
      { id:"email_preference",    label:"Email Response Pattern",   type:"text",     ph:"e.g., Responds to short punchy emails, data-driven, mobile reader", hint:"How does this persona type prefer to receive cold emails?", noConf:true },
    ]
  },
  leadScoring: { label:"Lead Scoring", icon:"⊛",
    fields:[
      { id:"interested_criteria",     label:"Interested Reply",       type:"textarea", ph:"Asked a question, requested more info, said 'tell me more', forwarded to colleague…", rows:2, hint:"What does a positive signal look like for this persona?" },
      { id:"warm_criteria",           label:"Warm Lead",              type:"textarea", ph:"Replied positively + matches ICP + has budget authority signals.", rows:2, hint:"Ready for a sales conversation but hasn't committed to a meeting" },
      { id:"meeting_ready_criteria",  label:"Meeting-Ready",          type:"textarea", ph:"Expressed clear interest in next steps, asked about pricing/timeline, agreed to a call.", rows:2, hint:"Hand off to sales immediately" },
      { id:"not_now_criteria",        label:"Not Now (Nurture)",      type:"textarea", ph:"Interested but timing is wrong — 'reach out in Q3', 'renewing current contract in 6 months'.", rows:2, hint:"Add to nurture sequence, follow up later" },
      { id:"dead_criteria",           label:"Dead / Disqualified",    type:"textarea", ph:"Wrong person, no budget ever, competitor employee, explicit unsubscribe.", rows:2, hint:"Remove from outreach permanently" },
    ]
  },
  notes: { label:"Notes", icon:"◇",
    fields:[
      { id:"persona_notes", label:"Additional Notes", type:"textarea", ph:"Anything specific about this persona that AI should know — quirks, preferences, internal politics, seasonality, past interactions, etc.", rows:4, noConf:true, aiFill:false },
    ]
  },
};
