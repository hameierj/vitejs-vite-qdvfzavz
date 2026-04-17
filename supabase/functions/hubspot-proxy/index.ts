import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hubspot-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Whitelist of allowed paths. Supports wildcards via {id}.
const ALLOWED_PATHS: RegExp[] = [
  /^\/crm\/v3\/objects\/companies\/search$/,
  /^\/crm\/v3\/objects\/companies\/[^/]+$/,
  /^\/crm\/v3\/objects\/companies\/[^/]+\/associations\/(contacts|emails|notes|calls|meetings|tasks)$/,
  /^\/crm\/v3\/objects\/contacts\/[^/]+$/,
  /^\/crm\/v3\/objects\/contacts\/[^/]+\/associations\/emails$/,
  /^\/crm\/v3\/objects\/emails\/[^/]+$/,
  /^\/crm\/v3\/objects\/emails\/batch\/read$/,
  /^\/crm\/v3\/objects\/notes\/[^/]+$/,
  /^\/crm\/v3\/objects\/notes\/batch\/read$/,
  /^\/crm\/v3\/properties\/companies$/,
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { path, method = "GET", body } = await req.json();
    const token = req.headers.get("x-hubspot-token");

    if (!token) {
      return new Response(JSON.stringify({ error: "Missing x-hubspot-token header" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!ALLOWED_PATHS.some(rx => rx.test(path.split("?")[0]))) {
      return new Response(JSON.stringify({ error: `Path not allowed: ${path}` }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `https://api.hubapi.com${path}`;
    const fetchOpts: RequestInit = {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };
    if (body && method !== "GET") fetchOpts.body = JSON.stringify(body);

    const resp = await fetch(url, fetchOpts);
    const data = await resp.json();

    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
