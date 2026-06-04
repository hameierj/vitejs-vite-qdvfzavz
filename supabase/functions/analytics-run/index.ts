// analytics-run — parse B2B Rocket CSV exports, score vs. benchmarks, generate variant recommendations
// Step 1: { csvContent, workspaceId, campaignName? } → { scorecard, insights, recommendations }
// Step 2: { workspaceId, winnerId, variantData } → save winner to campaign_variants
//
// Required Supabase secrets:
//   ANTHROPIC_API_KEY
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-anthropic-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BENCHMARKS = {
  openRate: { poor: 0.20, avg: 0.35, good: 0.50, label: "Open Rate" },
  replyRate: { poor: 0.02, avg: 0.05, good: 0.09, label: "Reply Rate" },
  interestedRate: { poor: 0.005, avg: 0.015, good: 0.03, label: "Interested Rate" },
  meetingRate: { poor: 0.003, avg: 0.008, good: 0.02, label: "Meeting Rate" },
  bounceRate: { poor: 0.08, avg: 0.04, good: 0.02, label: "Bounce Rate", lowerIsBetter: true },
  linkedinConnectRate: { poor: 0.15, avg: 0.25, good: 0.40, label: "LinkedIn Connect Rate" },
  linkedinReplyRate: { poor: 0.02, avg: 0.05, good: 0.10, label: "LinkedIn Reply Rate" },
};

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function callAI(key: string, prompt: string, tokens = 3000, retries = 4): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-opus-4-8",
          max_tokens: tokens,
          system: "You are a senior B2B outreach optimization specialist. Analyze campaign data and generate actionable recommendations. Return only valid JSON.",
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(55000),
      });
      if (r.status === 429 || r.status >= 500) {
        if (attempt < retries) { await sleep(Math.min(1000 * Math.pow(2, attempt), 20000)); continue; }
        return "";
      }
      const json = await r.json();
      return json.content?.[0]?.text ?? "";
    } catch {
      if (attempt < retries) { await sleep(1000 * Math.pow(2, attempt)); continue; }
      return "";
    }
  }
  return "";
}

function parseCSV(csv: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = csv.trim().split("\n").filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const results: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { results.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    results.push(current.trim());
    return results;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(line => {
    const values = parseRow(line);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
  return { headers, rows };
}

function findColumn(headers: string[], candidates: string[]): string | null {
  for (const c of candidates) {
    const match = headers.find(h => h.toLowerCase().includes(c.toLowerCase()));
    if (match) return match;
  }
  return null;
}

function scoreBenchmark(value: number, benchmark: typeof BENCHMARKS.openRate): "poor" | "avg" | "good" {
  if (benchmark.lowerIsBetter) {
    if (value <= benchmark.good) return "good";
    if (value <= benchmark.avg) return "avg";
    return "poor";
  }
  if (value >= benchmark.good) return "good";
  if (value >= benchmark.avg) return "avg";
  return "poor";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? req.headers.get("x-anthropic-key") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  try {
    const body = await req.json();
    const { step = 1, workspaceId, csvContent, campaignName, winnerId, variantData } = body;

    const sb = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

    // ── Step 2: Save winner ───────────────────────────────────────────────────
    if (step === 2) {
      if (!sb || !workspaceId || !variantData) {
        return new Response(JSON.stringify({ error: "workspaceId and variantData required for step 2" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get or create campaign
      let campaignId = variantData.campaignId;
      if (!campaignId) {
        const { data: camp } = await sb.from("campaigns").insert({
          workspace_id: workspaceId,
          name: variantData.campaignName || "Unnamed Campaign",
          status: "active",
          data: {},
        }).select("id").single();
        campaignId = camp?.id;
      }

      if (campaignId) {
        // Mark previous winners as non-winner
        await sb.from("campaign_variants").update({ is_winner: false }).eq("campaign_id", campaignId);
        // Insert new winner
        await sb.from("campaign_variants").insert({
          campaign_id: campaignId,
          name: variantData.name,
          content: variantData,
          is_winner: true,
        });
      }

      return new Response(JSON.stringify({ saved: true, campaignId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 1: Parse CSV + score + recommend ────────────────────────────────
    if (!csvContent || typeof csvContent !== "string") {
      return new Response(JSON.stringify({ error: "csvContent required for step 1" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { headers, rows } = parseCSV(csvContent);

    // Detect columns
    const colSent = findColumn(headers, ["sent", "emails sent", "total sent"]);
    const colDelivered = findColumn(headers, ["delivered", "emails delivered"]);
    const colOpens = findColumn(headers, ["open", "opened", "unique opens"]);
    const colReplies = findColumn(headers, ["reply", "replied", "responses"]);
    const colInterested = findColumn(headers, ["interested", "positive"]);
    const colMeetings = findColumn(headers, ["meeting", "booked", "demo"]);
    const colBounce = findColumn(headers, ["bounce", "bounced"]);
    const colCampaign = findColumn(headers, ["campaign", "sequence", "name"]);
    const colStatus = findColumn(headers, ["status", "stage", "step"]);

    // Aggregate by campaign if campaign column exists
    type CampaignAgg = { sent: number; delivered: number; opens: number; replies: number; interested: number; meetings: number; bounces: number; count: number };
    const byName: Record<string, CampaignAgg> = {};
    const overall: CampaignAgg = { sent: 0, delivered: 0, opens: 0, replies: 0, interested: 0, meetings: 0, bounces: 0, count: 0 };

    for (const row of rows) {
      const name = (colCampaign ? row[colCampaign] : campaignName) || "All";
      if (!byName[name]) byName[name] = { sent: 0, delivered: 0, opens: 0, replies: 0, interested: 0, meetings: 0, bounces: 0, count: 0 };

      const n = byName[name];
      n.count++;
      overall.count++;

      // Row-level data (each row is one prospect)
      const status = colStatus ? (row[colStatus] || "").toLowerCase() : "";

      // Count sent
      if (colSent) { n.sent += parseFloat(row[colSent]) || 0; overall.sent += parseFloat(row[colSent]) || 0; }
      else { n.sent++; overall.sent++; }

      if (colDelivered) { n.delivered += parseFloat(row[colDelivered]) || 0; overall.delivered += parseFloat(row[colDelivered]) || 0; }
      else if (!colSent) { n.delivered++; overall.delivered++; }

      if (colOpens) { const v = parseFloat(row[colOpens]) || 0; n.opens += v; overall.opens += v; }
      else if (status.includes("open")) { n.opens++; overall.opens++; }

      if (colReplies) { const v = parseFloat(row[colReplies]) || 0; n.replies += v; overall.replies += v; }
      else if (status.includes("replied") || status.includes("reply")) { n.replies++; overall.replies++; }

      if (colInterested) { const v = parseFloat(row[colInterested]) || 0; n.interested += v; overall.interested += v; }
      else if (status.includes("interested") || status.includes("positive")) { n.interested++; overall.interested++; }

      if (colMeetings) { const v = parseFloat(row[colMeetings]) || 0; n.meetings += v; overall.meetings += v; }
      else if (status.includes("meeting") || status.includes("booked")) { n.meetings++; overall.meetings++; }

      if (colBounce) { const v = parseFloat(row[colBounce]) || 0; n.bounces += v; overall.bounces += v; }
      else if (status.includes("bounce")) { n.bounces++; overall.bounces++; }
    }

    // Build metrics
    function toMetrics(agg: CampaignAgg) {
      const base = agg.delivered || agg.sent || 1;
      return {
        sent: agg.sent,
        delivered: agg.delivered || agg.sent,
        openRate: agg.opens / base,
        replyRate: agg.replies / base,
        interestedRate: agg.interested / base,
        meetingRate: agg.meetings / base,
        bounceRate: agg.bounces / (agg.sent || 1),
        opens: agg.opens,
        replies: agg.replies,
        interested: agg.interested,
        meetings: agg.meetings,
        bounces: agg.bounces,
      };
    }

    const overallMetrics = toMetrics(overall);
    const campaignMetrics = Object.entries(byName).map(([name, agg]) => ({ name, metrics: toMetrics(agg) }));

    // Score vs. benchmarks
    const scorecard = {
      openRate: { value: overallMetrics.openRate, score: scoreBenchmark(overallMetrics.openRate, BENCHMARKS.openRate), benchmark: BENCHMARKS.openRate },
      replyRate: { value: overallMetrics.replyRate, score: scoreBenchmark(overallMetrics.replyRate, BENCHMARKS.replyRate), benchmark: BENCHMARKS.replyRate },
      interestedRate: { value: overallMetrics.interestedRate, score: scoreBenchmark(overallMetrics.interestedRate, BENCHMARKS.interestedRate), benchmark: BENCHMARKS.interestedRate },
      meetingRate: { value: overallMetrics.meetingRate, score: scoreBenchmark(overallMetrics.meetingRate, BENCHMARKS.meetingRate), benchmark: BENCHMARKS.meetingRate },
      bounceRate: { value: overallMetrics.bounceRate, score: scoreBenchmark(overallMetrics.bounceRate, BENCHMARKS.bounceRate), benchmark: BENCHMARKS.bounceRate },
    };

    // Save raw upload to Supabase
    if (sb && workspaceId) {
      await sb.from("analytics_uploads").insert({
        workspace_id: workspaceId,
        filename: campaignName || `upload_${Date.now()}`,
        parsed: { overall: overallMetrics, byCampaign: campaignMetrics, rowCount: rows.length },
        scorecard,
      });
    }

    // Ask Claude for insights and variant recommendations
    const aiPrompt = `You are analyzing B2B cold outreach campaign performance.

OVERALL METRICS (${rows.length} prospects):
- Open rate: ${(overallMetrics.openRate * 100).toFixed(1)}% (benchmark avg: 35%, good: 50%)
- Reply rate: ${(overallMetrics.replyRate * 100).toFixed(1)}% (benchmark avg: 5%, good: 9%)
- Interested rate: ${(overallMetrics.interestedRate * 100).toFixed(1)}% (benchmark avg: 1.5%, good: 3%)
- Meeting rate: ${(overallMetrics.meetingRate * 100).toFixed(1)}% (benchmark avg: 0.8%, good: 2%)
- Bounce rate: ${(overallMetrics.bounceRate * 100).toFixed(1)}% (benchmark good: <2%)
- Total sent: ${overallMetrics.sent} | Replies: ${overallMetrics.replies} | Interested: ${overallMetrics.interested} | Meetings: ${overallMetrics.meetings}

${campaignMetrics.length > 1 ? `BY CAMPAIGN:\n${campaignMetrics.map(c => `${c.name}: open=${(c.metrics.openRate*100).toFixed(1)}% reply=${(c.metrics.replyRate*100).toFixed(1)}% interested=${(c.metrics.interestedRate*100).toFixed(1)}%`).join("\n")}` : ""}

Return ONLY a JSON object:
{
  "overallGrade": "A" | "B" | "C" | "D" | "F",
  "gradeSummary": "2-3 sentence overall assessment",
  "topInsights": [
    { "id": "ins_1", "type": "win" | "issue" | "opportunity", "title": "short insight title", "body": "2 sentences", "priority": "high" | "medium" | "low" }
  ],
  "variants": [
    {
      "id": "var_1",
      "metric": "which metric this improves",
      "hypothesis": "We believe [change] will improve [metric] because [reason]",
      "change": "specific sequence/subject/timing change to test",
      "expectedLift": "e.g. +1-2% reply rate",
      "effort": "low" | "medium" | "high"
    }
  ]
}

Generate 3-5 insights and 3-4 variant recommendations focused on the weakest metrics.`;

    const aiRaw = await callAI(anthropicKey, aiPrompt);
    let aiResult: any = { overallGrade: "C", gradeSummary: "", topInsights: [], variants: [] };
    try {
      const match = aiRaw.match(/\{[\s\S]*\}/);
      aiResult = JSON.parse(match?.[0] ?? aiRaw);
    } catch { /* use defaults */ }

    return new Response(JSON.stringify({
      rowCount: rows.length,
      overallMetrics,
      campaignMetrics,
      scorecard,
      ...aiResult,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
