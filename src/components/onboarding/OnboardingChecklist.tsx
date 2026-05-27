import { useState } from "react";

const C = {
  bg: "#F8F9FE", canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7",
  borderHi: "#D8DEE9", text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentMid: "#6C5CE722", accentBorder: "#6C5CE733",
  green: "#00B894", greenLo: "#00B8940F", greenBorder: "#00B89433",
  amber: "#FDCB6E", amberLo: "#FDCB6E0F", amberBorder: "#FDCB6E40",
  faint: "#F3F4FB",
};
const head = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

interface Props {
  companyData: any;
  icpTree: any;
  campaigns: any[];
  callRecords: any[];
  onNavigate: (view: string) => void;
  onStartResearch: () => void;
  onCopyIntakeLink: () => void;
  onOpenIcpScoring: () => void;
}

type StepStatus = "complete" | "in_progress" | "locked" | "ready";

interface Step {
  id: string;
  num: number;
  title: string;
  description: string;
  cta: string;
  status: StepStatus;
  onAction: () => void;
  doneCta?: string;
  onDone?: () => void;
}

export function OnboardingChecklist({ companyData, icpTree, campaigns, callRecords, onNavigate, onStartResearch, onCopyIntakeLink, onOpenIcpScoring }: Props) {
  const [copied, setCopied] = useState(false);

  const cd = companyData as any;

  const hasResearch   = !!cd?._initialResearchBrief;
  const reviewed      = !!cd?._researchBriefReviewed;
  const intakeReceived = !!cd?._intakeSubmittedAt;
  const hasTranscript  = (callRecords || []).some((r: any) => r.callType === "onboarding" || r.callType === "kickoff");
  const hasProfile     = !!(cd?.co_name && cd?.co_pitch && cd?.co_product);
  const hasIcpTree     = !!icpTree;
  const hasScoring     = !!cd?._icpScoringResult;
  const hasCampaigns   = (campaigns || []).some((c: any) => c.source === "onboarding_plan");

  function status(complete: boolean, unlocked: boolean): StepStatus {
    if (complete) return "complete";
    if (!unlocked) return "locked";
    return "ready";
  }

  const steps: Step[] = [
    {
      id: "research", num: 1,
      title: "Run Initial AI Research",
      description: "Enter the client's domain and let AI scrape their website, map their products, and draft a pre-call research brief you can review before the onboarding conversation.",
      cta: "Run Research",
      status: status(hasResearch, true),
      onAction: onStartResearch,
      doneCta: "View Brief",
      onDone: () => onNavigate("research-brief"),
    },
    {
      id: "review", num: 2,
      title: "Review Research Brief",
      description: "Read the AI-generated brief. It surfaces key hypotheses, recommended angles, and call prep notes — things to ask or validate during the onboarding call.",
      cta: "Open Brief",
      status: status(reviewed, hasResearch),
      onAction: () => onNavigate("research-brief"),
    },
    {
      id: "intake", num: 3,
      title: "Share Client Intake Form",
      description: "Copy a shareable link for the client to fill out before (or after) the call. Covers their products, target customer, messaging preferences, and proof points.",
      cta: copied ? "Copied!" : "Copy Intake Link",
      status: status(intakeReceived, true),
      onAction: () => {
        onCopyIntakeLink();
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      },
      doneCta: intakeReceived ? "Form submitted ✓" : undefined,
    },
    {
      id: "transcript", num: 4,
      title: "Upload Onboarding Call Transcript",
      description: "After the kickoff call, upload the transcript (or Fireflies link). AI will extract answers and populate the company profile and ICP fields automatically.",
      cta: "Upload Transcript",
      status: status(hasTranscript, true),
      onAction: () => onNavigate("calls"),
    },
    {
      id: "profile", num: 5,
      title: "Synthesize Company Profile",
      description: "AI merges the intake form responses and call transcript into a complete company profile — products, ICPs, value props, proof points, and messaging all pre-filled.",
      cta: "Go to Company Profile",
      status: status(hasProfile, intakeReceived || hasTranscript),
      onAction: () => onNavigate("onboarding"),
    },
    {
      id: "icp-tree", num: 6,
      title: "Generate ICP Tree",
      description: "Build the full hierarchical ICP model: ideal customer profiles → personas → jobs-to-be-done → trigger events → outreach plays. The engine for all future campaigns.",
      cta: "Generate ICP Tree",
      status: status(hasIcpTree, hasProfile),
      onAction: () => onNavigate("icp-tree"),
      doneCta: "View ICP Tree",
      onDone: () => onNavigate("icp-tree"),
    },
    {
      id: "scoring", num: 7,
      title: "Score & Prioritize ICPs",
      description: "AI scores each ICP on market size, product-market fit, proof availability, outreach accessibility, and competitive advantage — then ranks them so you know where to start.",
      cta: "Score ICPs",
      status: status(hasScoring, hasIcpTree),
      onAction: onOpenIcpScoring,
      doneCta: "View Scoring",
      onDone: onOpenIcpScoring,
    },
    {
      id: "campaigns", num: 8,
      title: "Plan Email + LinkedIn Campaigns",
      description: "Generate 5-touch email and LinkedIn sequences for your top-scored ICPs using the GTM outreach strategy framework. Ready to deploy immediately.",
      cta: "Plan Campaigns",
      status: status(hasCampaigns, hasScoring),
      onAction: onOpenIcpScoring,
      doneCta: "View Campaigns",
      onDone: () => onNavigate("campaigns"),
    },
  ];

  const completedCount = steps.filter(s => s.status === "complete").length;
  const pct = Math.round((completedCount / steps.length) * 100);

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 24px 48px", fontFamily: head }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.accent, letterSpacing: 0.8, marginBottom: 8, textTransform: "uppercase" as const }}>
          ONBOARDING HUB
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: "0 0 6px" }}>
          Client Onboarding Checklist
        </h1>
        <p style={{ fontSize: 13, color: C.textSoft, margin: 0, lineHeight: 1.6 }}>
          Standardized process from first research to first campaign. Complete each step in order.
        </p>

        {/* Progress bar */}
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.border, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: C.accent, transition: "width .5s ease" }} />
          </div>
          <span style={{ fontSize: 11, fontFamily: mono, fontWeight: 700, color: C.accent, flexShrink: 0 }}>
            {completedCount}/{steps.length}
          </span>
        </div>
      </div>

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 0 }}>
        {steps.map((step, idx) => {
          const isComplete  = step.status === "complete";
          const isReady     = step.status === "ready";
          const isLocked    = step.status === "locked";
          const isLast      = idx === steps.length - 1;

          const borderColor = isComplete ? C.green : isReady ? C.accent : C.border;
          const numBg       = isComplete ? C.green : isReady ? C.accent : C.muted;

          return (
            <div key={step.id} style={{ display: "flex", gap: 16 }}>
              {/* Left: number + connector */}
              <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", flexShrink: 0 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: isComplete ? C.green : isLocked ? C.faint : C.accentLo,
                  border: `2px solid ${borderColor}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: isComplete ? 14 : 11,
                  fontWeight: 700,
                  color: isComplete ? "#fff" : isLocked ? C.muted : C.accent,
                  fontFamily: mono,
                  flexShrink: 0,
                  transition: "all .3s",
                }}>
                  {isComplete ? "✓" : step.num}
                </div>
                {!isLast && (
                  <div style={{
                    width: 2, flex: 1, minHeight: 16,
                    background: isComplete ? C.green : C.border,
                    margin: "4px 0",
                    transition: "background .3s",
                  }} />
                )}
              </div>

              {/* Right: content */}
              <div style={{
                flex: 1, paddingBottom: isLast ? 0 : 20,
                paddingTop: 2,
              }}>
                <div style={{
                  background: C.canvas,
                  border: `1px solid ${isReady ? C.accentBorder : isComplete ? C.greenBorder : C.border}`,
                  borderRadius: 10,
                  padding: "14px 16px",
                  marginBottom: isLast ? 0 : 4,
                  opacity: isLocked ? 0.55 : 1,
                  transition: "all .3s",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginBottom: 4 }}>
                        {step.title}
                        {isComplete && (
                          <span style={{ marginLeft: 8, fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.green, background: C.greenLo, padding: "2px 7px", borderRadius: 4, letterSpacing: 0.4 }}>
                            DONE
                          </span>
                        )}
                        {isReady && (
                          <span style={{ marginLeft: 8, fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.accent, background: C.accentLo, padding: "2px 7px", borderRadius: 4, letterSpacing: 0.4 }}>
                            READY
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 12.5, color: C.textSoft, margin: 0, lineHeight: 1.6 }}>
                        {step.description}
                      </p>
                    </div>

                    {/* CTA button */}
                    {!isLocked && (
                      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column" as const, gap: 6 }}>
                        {isComplete && step.doneCta && step.onDone ? (
                          <button onClick={step.onDone}
                            style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${C.greenBorder}`,
                              background: C.greenLo, color: C.green, fontSize: 12, fontWeight: 700,
                              cursor: "pointer", fontFamily: head, whiteSpace: "nowrap" as const }}>
                            {step.doneCta}
                          </button>
                        ) : !isComplete ? (
                          <button onClick={step.onAction}
                            style={{ padding: "7px 14px", borderRadius: 7, border: "none",
                              background: isReady ? C.accent : C.faint,
                              color: isReady ? "#fff" : C.muted,
                              fontSize: 12, fontWeight: 700,
                              cursor: isReady ? "pointer" : "default", fontFamily: head,
                              whiteSpace: "nowrap" as const,
                              boxShadow: isReady ? `0 2px 8px ${C.accent}30` : "none" }}>
                            {step.cta}
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
