const { answer } = require("../lib/answer");

// shortcut: belum ada rate limit lintas instance (butuh Redis/KV). Perlindungan
// sekarang hanya batas panjang pesan & riwayat. Upgrade kalau endpoint ini
// dipakai publik di luar penilaian praktikum.
const MAX_HISTORY_ITEMS = 6;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Gunakan metode POST." });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const message = String(body.message || "").trim();

    if (!message) {
      res.status(400).json({ error: "Pesan kosong." });
      return;
    }

    const history = Array.isArray(body.history)
      ? body.history
          .filter(h => h && typeof h.content === "string")
          .slice(-MAX_HISTORY_ITEMS)
      : [];

    const result = await answer(message, history);
    res.status(200).json(result);
  } catch (err) {
    console.error("[/api/chat]", err);
    res.status(500).json({ error: "Waduh bro, sistemnya lagi bermasalah. Coba lagi sebentar ya." });
  }
};
