import express from "express";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) console.warn("تنبيه: المتغير GEMINI_API_KEY غير موجود");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "8mb" }));
app.use(express.static("public"));

// حد بسيط: 10 طلبات في الدقيقة لكل زائر
const hits = new Map();
app.use("/api", (req, res, next) => {
  const now = Date.now();
  const recent = (hits.get(req.ip) || []).filter(t => now - t < 60000);
  if (recent.length >= 10) return res.status(429).json({ error: "rate" });
  recent.push(now);
  hits.set(req.ip, recent);
  next();
});

// تحويل صيغة الرسائل إلى صيغة Gemini
function toParts(content) {
  if (typeof content === "string") return [{ text: content }];
  return content.map(b =>
    b.type === "image"
      ? { inline_data: { mime_type: b.source.media_type, data: b.source.data } }
      : { text: b.text }
  );
}

app.post("/api/chat", async (req, res) => {
  const { messages, system } = req.body || {};
  if (!Array.isArray(messages) || !messages.length || messages.length > 40)
    return res.status(400).json({ error: "bad_request" });
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
      return res.status(r.status === 429 ? 429 : 502).json({ error: r.status === 429 ? "rate" : "upstream" });
    }
    const parts = d.candidates?.[0]?.content?.parts || [];
    const text = parts.map(p => p.text || "").join("");
    res.json({ text: text || "لم أستطع إنتاج رد لهذا الطلب." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server" });
  }
});

app.listen(process.env.PORT || 3000, () => console.log("محمد كود يعمل"));
