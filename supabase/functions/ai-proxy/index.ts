// ai-proxy — edge function
// Generic streaming Anthropic proxy for browser-side AI features (the Copilot).
// Holds the Anthropic key server-side so the browser never needs a valid
// localStorage key — the same ANTHROPIC_API_KEY secret the Getting Started
// flow (gs-research-run) uses.
//
// Accepts { messages, system?, max_tokens?, tools?, model? } and pipes the
// Anthropic SSE stream straight back to the client (stream:true always), so
// the client's existing SSE parser works unchanged.
//
// Required Supabase secrets:
//   ANTHROPIC_API_KEY   (falls back to x-anthropic-key header if unset)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-anthropic-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { messages, system, max_tokens, tools, model } = body ?? {};

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? req.headers.get("x-anthropic-key") ?? "";
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: { message: "No ANTHROPIC_API_KEY configured on the server" } }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: { message: "messages array is required" } }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: Record<string, unknown> = {
      model: model || "claude-sonnet-4-6",
      max_tokens: max_tokens || 2048,
      messages,
      stream: true,
    };
    if (system) payload.system = system;
    if (Array.isArray(tools) && tools.length) payload.tools = tools;

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        // Needed for the 1h cache_control TTL the Copilot uses on its context block.
        "anthropic-beta": "extended-cache-ttl-2025-04-11",
      },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => "");
      let parsed: unknown = null;
      try { parsed = JSON.parse(errText); } catch { /* not json */ }
      return new Response(
        JSON.stringify(parsed ?? { error: { message: `Anthropic ${upstream.status}: ${errText.slice(0, 500)}` } }),
        { status: upstream.status || 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Pipe the SSE stream straight back to the browser.
    return new Response(upstream.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: { message: (e as Error).message } }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
