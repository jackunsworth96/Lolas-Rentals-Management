import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VALID_STORES = new Set(["lolas", "bass"]);

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-wc-webhook-signature, x-wc-webhook-source, x-wc-webhook-topic",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hmacSha256(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const store = url.searchParams.get("store")?.toLowerCase() ?? "";

  if (!VALID_STORES.has(store)) {
    return json(
      { error: "Missing or invalid ?store= parameter. Use ?store=lolas or ?store=bass" },
      400,
    );
  }

  const secretEnvName = store === "lolas" ? "WEBHOOK_SECRET_LOLAS" : "WEBHOOK_SECRET_BASS";
  const secret = Deno.env.get(secretEnvName);

  if (!secret) {
    console.error(`${secretEnvName} is not set in Edge Function secrets`);
    return json({ error: "Server misconfiguration" }, 500);
  }

  const rawBody = await req.text();

  const wcSignature = req.headers.get("x-wc-webhook-signature");
  const customSecret = req.headers.get("x-webhook-secret");

  let verified = false;

  if (wcSignature) {
    const expectedSig = await hmacSha256(secret, rawBody);
    verified = wcSignature === expectedSig;
  } else if (customSecret) {
    verified = customSecret === secret;
  }

  if (!verified) {
    return json({ error: "Unauthorized – invalid signature or secret" }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { error } = await supabase
    .from("orders_raw")
    .insert({ source: store, payload });

  if (error) {
    console.error("Insert error:", error);
    return json({ error: error.message }, 500);
  }

  return json({ ok: true, store });
});
