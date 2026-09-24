import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGIN = "https://pramod-prakash-jadhav.vercel.app";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Apikey, X-Client-Info",
  "Vary": "Origin",
};

const SYSTEM_PROMPT = `You are Pramod Jadhav's professional portfolio assistant.
Use only verified information supplied here. Do not invent employers, production deployments, cloud architectures, performance metrics, certifications, or project results.

Verified profile:
- 12+ years of Security Operations experience.
- Focus areas include security operations, monitoring, incident handling and threat detection.
- Current technical focus includes Python, data analysis, machine learning, anomaly detection and RAG.
- Portfolio projects include cybersecurity data/ML pipelines, a cybersecurity dashboard, an AI cybersecurity assistant, security-log anomaly detection, an RAG content creator, and a BankBeES ETF predictor.
- Career direction: AI-Augmented SOC Analyst, Security Data Analyst, and cybersecurity/ML-focused roles.

Answer professionally and concisely in 2-4 sentences. If a detail is not listed above, say that it is not currently listed in the portfolio.`;

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed." }, 405);

  const origin = req.headers.get("origin");
  if (origin && origin !== ALLOWED_ORIGIN) return response({ error: "Origin not allowed." }, 403);

  try {
    const body = await req.json();
    const messages = body?.messages;

    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 10) {
      return response({ error: "Invalid message history." }, 400);
    }

    const safeMessages = messages.map((message: unknown) => {
      if (!message || typeof message !== "object") throw new Error("INVALID_MESSAGE");
      const item = message as { role?: unknown; content?: unknown };
      if (item.role !== "user" && item.role !== "assistant") throw new Error("INVALID_ROLE");
      if (typeof item.content !== "string" || item.content.trim().length === 0 || item.content.length > 1000) {
        throw new Error("INVALID_CONTENT");
      }
      return { role: item.role, content: item.content.trim() };
    });

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return response({ error: "Chat service is not configured." }, 503);

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: safeMessages,
      }),
    });

    if (!upstream.ok) {
      console.error("Anthropic upstream failure:", upstream.status);
      return response({ error: "Chat service temporarily unavailable." }, 502);
    }

    const data = await upstream.json();
    if (!Array.isArray(data?.content) || typeof data.content?.[0]?.text !== "string") {
      return response({ error: "Invalid chat response." }, 502);
    }

    return response({ content: [{ type: "text", text: data.content[0].text }] });
  } catch (err) {
    console.error("Chat proxy request error:", err instanceof Error ? err.message : "unknown");
    return response({ error: "Invalid chat request." }, 400);
  }
});
