import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-slack-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { endpoint, params } = await req.json();
    const slackToken = req.headers.get("x-slack-token");

    if (!slackToken) {
      return new Response(JSON.stringify({ ok: false, error: "Missing x-slack-token header" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Whitelist allowed Slack API endpoints
    const allowed = [
      "conversations.history",
      "conversations.list",
      "conversations.members",
      "users.list",
      "users.info",
    ];
    if (!allowed.includes(endpoint)) {
      return new Response(JSON.stringify({ ok: false, error: `Endpoint not allowed: ${endpoint}` }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build query string from params
    const qs = new URLSearchParams(params || {}).toString();
    const url = `https://slack.com/api/${endpoint}${qs ? `?${qs}` : ""}`;

    const slackResp = await fetch(url, {
      headers: { "Authorization": `Bearer ${slackToken}` },
    });

    const data = await slackResp.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
