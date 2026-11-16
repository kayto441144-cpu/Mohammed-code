const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const KEY = process.env.GEMINI_API_KEY;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" }
  });

function toParts(content) {
  if (typeof content === "string") return [{ text: content }];
  return content.map(b =>
    b.type === "image"
      ? { inline_data: { mime_type: b.source.media_type, data: b.source.data } }
      : { text: b.text }
  );
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let data;
  try { data = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const { messages, system } = data || {};
  if (!Array.isArray(messages) || !messages.length || messages.length > 40)
    return json({ error: "bad_request" }, 400);
  try {
    const body = {
      contents: messages.map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: toParts(m.content)
      })),
      generationConfig: { maxOutputTokens: 2000 }
    };
    if (typeof system === "string")
      body.systemInstruction = { parts: [{ text: system.slice(0, 2000) }] };

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": KEY },
        body: JSON.stringify(body)
      }
    );
    const d = await r.json();
    if (!r.ok) {
      console.error("Gemini error:", JSON.stringify(d));
      return json({ error: r.status === 429 ? "rate" : "upstream" }, r.status === 429 ? 429 : 502);
    }
    const parts = d.candidates?.[0]?.content?.parts || [];
    const text = parts.map(p => p.text || "").join("");
    return json({ text: text || "لم أستطع إنتاج رد لهذا الطلب." });
  } catch (e) {
    console.error(e);
    return json({ error: "server" }, 500);
  }
};

export const config = { path: "/api/chat" };
