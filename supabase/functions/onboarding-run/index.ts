// onboarding-run — edge function
// Compares onboarding transcript/form against existing handoff + research docs.
// Step 1: returns proposed changes (field-level diffs)
// Step 2: applies approved changes → updates documents
//
// Required Supabase secrets:
//   ANTHROPIC_API_KEY
//   SUPABASE_URL          (auto-set by Supabase runtime)
//   SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-anthropic-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callAI(
  anthropicKey: string,
  prompt: string,
  sys = "",
  tokens = 3000,
  retries = 4,
): Promise<string> {
  const sysMsg = sys || "You are a senior B2B customer success strategist. Return only valid JSON.";
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
          model: "claude-opus-4-8",
          max_tokens: tokens,
          system: sysMsg,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(55000),
      });
      if (r.status === 429 || r.status === 529 || r.status >= 500) {
        if (attempt < retries) { await sleep(Math.min(1000 * Math.pow(2, attempt), 20000)); continue; }
        return "";
      }
      const json = await r.json();
      return json.content?.[0]?.text ?? "";
    } catch (e) {
      if (attempt < retries) { await sleep(1000 * Math.pow(2, attempt)); continue; }
      return "";
    }
  }
  return "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? req.headers.get("x-anthropic-key") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  try {
    const body = await req.json();
    const { step, workspaceId, onboardingContent, approvedChanges } = body;

    if (!workspaceId) {
      return new Response(JSON.stringify({ error: "workspaceId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

    // Load existing docs from Supabase
    let existingDocs: Record<string, any> = {};
    if (sb) {
      const { data: docs } = await sb
        .from("documents")
        .select("type, content, version")
        .eq("workspace_id", workspaceId)
        .in("type", ["handoff", "research", "strategy"]);

      for (const doc of docs ?? []) {
        existingDocs[doc.type] = doc.content;
      }
    }

    // ── Step 1: Diff — find proposed changes ─────────────────────────────────
    if (!step || step === 1) {
      if (!onboardingContent || typeof onboardingContent !== "string") {
        return new Response(JSON.stringify({ error: "onboardingContent required for step 1" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const existingStr = JSON.stringify(existingDocs, null, 2);

      const prompt = `You are comparing a client's onboarding call/form against their existing handoff documentation.
Identify specific pieces of information that should update or add to the existing docs.

EXISTING DOCUMENTS:
${existingStr.slice(0, 8000)}

ONBOARDING CONTENT (transcript or form):
${onboardingContent.slice(0, 16000)}

Return ONLY a JSON object with this structure:
{
  "proposedChanges": [
    {
      "id": "unique string id like 'change_1'",
      "category": "one of: contact_info | pain_points | use_case | deal_details | next_steps | goals | icp | company_context",
      "field": "specific field name being updated",
      "currentValue": "what the existing doc says (or null if new info)",
      "proposedValue": "what it should be updated to",
      "reason": "one sentence: why this change is warranted based on the onboarding content",
      "confidence": "high | medium | low",
      "quote": "the exact quote from onboarding content that supports this change (max 200 chars)"
    }
  ],
  "summary": "2-3 sentence overall assessment of what changed between sales call and onboarding",
  "newInfo": ["any important new information that doesn't fit existing fields"]
}

Only include changes where onboarding content clearly contradicts or meaningfully adds to existing docs.
Skip trivial differences or restating the same info differently.`;

      const raw = await callAI(anthropicKey, prompt, undefined, 3000);

      let result: any;
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        result = JSON.parse(jsonMatch?.[0] ?? raw);
      } catch {
        return new Response(JSON.stringify({ error: "Failed to parse AI response", raw }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ...result, existingDocs }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 2: Apply approved changes ────────────────────────────────────────
    if (step === 2) {
      if (!Array.isArray(approvedChanges) || approvedChanges.length === 0) {
        return new Response(JSON.stringify({ error: "approvedChanges required for step 2" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Build an updated handoff doc by applying approved changes
      const prompt = `Apply these approved changes to the existing handoff document.

EXISTING HANDOFF DOC:
${JSON.stringify(existingDocs.handoff ?? {}, null, 2)}

APPROVED CHANGES TO APPLY:
${JSON.stringify(approvedChanges, null, 2)}

Return ONLY a JSON object that is the updated handoff document with all approved changes applied.
Keep the same structure as the existing handoff doc. Add/update fields as specified by the approved changes.
Include a "lastUpdated" field with today's ISO date.`;

      const raw = await callAI(anthropicKey, prompt, undefined, 2000);

      let updatedHandoff: any;
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        updatedHandoff = JSON.parse(jsonMatch?.[0] ?? raw);
      } catch {
        return new Response(JSON.stringify({ error: "Failed to parse AI response", raw }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Save updated handoff as a new version
      if (sb) {
        const { data: existing } = await sb
          .from("documents")
          .select("id, version")
          .eq("workspace_id", workspaceId)
          .eq("type", "handoff")
          .order("version", { ascending: false })
          .limit(1)
          .single();

        // Save onboarding doc as a new type
        await sb.from("documents").insert({
          workspace_id: workspaceId,
          type: "onboarding",
          version: 1,
          content: {
            approvedChanges,
            updatedHandoff,
            appliedAt: new Date().toISOString(),
          },
          approved_at: new Date().toISOString(),
        });

        // Update the handoff doc
        if (existing?.id) {
          await sb.from("documents").insert({
            workspace_id: workspaceId,
            type: "handoff",
            version: (existing.version ?? 1) + 1,
            content: updatedHandoff,
          });
        }

        // Mark workspace stage 5 in progress
        await sb
          .from("workspaces")
          .update({ stage_statuses: { "5": "approved" } })
          .eq("id", workspaceId);
      }

      return new Response(JSON.stringify({ updatedHandoff, applied: approvedChanges.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "step must be 1 or 2" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
