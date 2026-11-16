const Groq = require("groq-sdk");
const { RAGEngine, formatPrice } = require("./rag");

// Identitas lapak. Ganti di sini kalau pindah lapak Shopee.
const SHOP = {
  name: "BRODO",
  url: "https://shopee.co.id/brodoofficialstore",
  waNumber: (process.env.WA_NUMBER || "").replace(/\D/g, "")
};

// Model cadangan dipakai berurutan kalau model utama mati atau kuotanya habis.
// Daftar model tiap akun Groq berbeda; cek di https://console.groq.com/docs/models
// kalau semuanya gagal dengan error 404 model_not_found.
const FALLBACK_MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"];

const MAX_HISTORY = 6; // 3 giliran tanya-jawab
const MAX_MESSAGE_CHARS = 500;
const MAX_CARDS = 6; // kartu produk yang ditampilkan per jawaban

// Kalimat baku saat produk tidak ada. Tidak mengarahkan ke mana-mana.
const NOT_FOUND_REPLY = "Halo bro, produk yang kamu cari tidak ada nih.";

// Dipakai kalau Groq tidak tersedia tapi produknya ketemu: kartu tetap tampil.
const FOUND_REPLY = "Ada nih bro, ini yang cocok sama yang kamu cari.";

// Satu engine per proses: CSV dibaca sekali, bukan tiap pesan masuk.
const rag = new RAGEngine();

let groq = null;
function getGroq() {
  const key = process.env.GROQ_API_KEY;
  if (!key || key.startsWith("gsk_isi")) return null;
  if (!groq) groq = new Groq({ apiKey: key });
  return groq;
}

// Link pesan WhatsApp siap kirim untuk satu produk.
function waLinkFor(product) {
  if (!SHOP.waNumber) return "";
  const text = `Halo ${SHOP.name}, saya mau pesan ${product.nama} (${formatPrice(product.harga)}).`;
  return `https://wa.me/${SHOP.waNumber}?text=${encodeURIComponent(text)}`;
}

function toCard(product) {
  return {
    nama: product.nama,
    kategori: product.kategori,
    harga: formatPrice(product.harga),
    hargaAngka: product.hargaAngka,
    deskripsi: product.deskripsi,
    gambar: product.gambar || "",
    rating: product.rating || "",
    link: product.link || "",
    waLink: waLinkFor(product)
  };
}

function buildSystemPrompt(ragContext) {
  return `Kamu asisten belanja ${SHOP.name}, toko sepatu dan fashion pria lokal. Bahasa Indonesia santai dan akrab.

PERSONA (WAJIB):
- Panggil pelanggan "bro" di setiap jawaban. Contoh: "Siap bro", "Ada nih bro".
- Ramah, singkat, tidak kaku, tidak formal berlebihan.

CARA MENJAWAB (SANGAT PENTING):
- Kartu produk (gambar, nama, harga, tombol pesan) sudah ditampilkan otomatis oleh sistem di bawah jawabanmu.
- Jadi JANGAN menulis ulang daftar produk, harga, atau link apa pun.
- Tulis MAKSIMAL 2 kalimat pengantar saja, lalu berhenti. Contoh yang benar:
  "Ada nih bro, ini beberapa sneakers putih yang lagi tersedia. Tinggal klik Pesan kalau ada yang cocok."
- Jangan pernah menyebut "katalog", "data", "sistem", atau "CSV".
- Jangan menyebut warna, bahan, atau detail produk di kalimat pengantar kecuali
  pelanggan memang menanyakannya. Detail sudah ada di kartu.
- Jangan mengarang produk, harga, warna, ukuran, atau stok yang tidak ada di daftar di bawah.

${ragContext}`;
}

// Balasan ini dipakai dua kanal yang sintaks tebalnya berbeda: di web "*teks*"
// tampil apa adanya sebagai bintang. Jadi penanda tebal dari LLM dibuang, dan
// tebal khusus WhatsApp hanya ditambahkan di productsAsText().
function cleanReply(text) {
  if (!text) return "";
  return String(text)
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function greetingReply() {
  return `Halo bro! Selamat datang di ${SHOP.name}.\n\nMau cari apa hari ini? Sneakers, sandal, dompet, atau parfum tinggal sebut aja bro.`;
}

function gratitudeReply() {
  return "Sama-sama bro! Kalau butuh rekomendasi lain tinggal chat lagi ya.";
}

function isGratitude(text) {
  return /^(terima\s*kasih|makasih|makasi|thanks|thank\s*you|thx|nuhun|suwun)\b/i.test(String(text).trim());
}

/**
 * Jawab satu pesan pengguna.
 * @param {string} message pesan terbaru dari pengguna
 * @param {Array<{role: string, content: string}>} history riwayat percakapan
 * @returns {Promise<{reply: string, products: Array, source: string}>}
 *          source: template | rag-llm | fallback
 */
async function answer(message, history = []) {
  const text = String(message || "").trim().slice(0, MAX_MESSAGE_CHARS);
  if (!text) return { reply: greetingReply(), products: [], source: "template" };

  // Lapis 1: sapaan dan terima kasih dijawab template, tanpa memanggil LLM.
  if (rag.isGreeting(text)) return { reply: greetingReply(), products: [], source: "template" };
  if (isGratitude(text)) return { reply: gratitudeReply(), products: [], source: "template" };

  // Lapis 2: cari produk dari pesan terbaru. Kalau tidak ketemu dan pesannya
  // pendek ("yang putih ada?"), ulangi pencarian dengan pertanyaan sebelumnya
  // supaya pertanyaan lanjutan tetap nyambung.
  let found = rag.search(text);
  if (found.length === 0 && history.length > 0) {
    const previous = history
      .filter(h => h.role === "user")
      .slice(-2)
      .map(h => h.content)
      .join(" ");
    if (previous) found = rag.search(`${previous} ${text}`);
  }

  // Lapis 3: tidak ada produk yang cocok. Dijawab kalimat baku, tanpa
  // memanggil LLM — jawabannya jadi pasti sama setiap kali dan hemat kuota.
  // LLM terbukti suka memparafrase kalimat ini kalau diserahkan kepadanya.
  if (found.length === 0) {
    return { reply: NOT_FOUND_REPLY, products: [], source: "template" };
  }

  const products = found.slice(0, MAX_CARDS).map(toCard);

  // Konteks untuk LLM dibuat dari produk yang sama persis dengan kartunya,
  // supaya kalimat pengantar tidak menyebut produk yang tidak ditampilkan.
  const ragContext =
    "Produk yang sedang ditampilkan ke pelanggan:\n" +
    products.map(p => `- ${p.nama} (${p.harga})`).join("\n");

  const client = getGroq();
  if (!client) return { reply: FOUND_REPLY, products, source: "fallback" };

  const messages = [
    { role: "system", content: buildSystemPrompt(ragContext) },
    ...history.slice(-MAX_HISTORY).map(h => ({
      role: h.role === "assistant" ? "assistant" : "user",
      content: String(h.content).slice(0, MAX_MESSAGE_CHARS)
    })),
    { role: "user", content: text }
  ];

  const models = [process.env.GROQ_MODEL, ...FALLBACK_MODELS].filter(Boolean);
  const tried = new Set();

  for (const model of models) {
    if (tried.has(model)) continue;
    tried.add(model);
    try {
      const completion = await client.chat.completions.create({
        model,
        messages,
        max_tokens: Number(process.env.GROQ_MAX_TOKENS || 300),
        temperature: 0.4
      });
      const reply = completion.choices?.[0]?.message?.content;
      if (reply) return { reply: cleanReply(reply), products, source: "rag-llm" };
    } catch (err) {
      console.warn(`[Groq ${model}] gagal: ${err.message}`);
    }
  }

  return { reply: FOUND_REPLY, products, source: "fallback" };
}

// WhatsApp tidak bisa menampilkan kartu, jadi produk ditulis rapi sebagai teks
// (bukan baris data mentah) dan ditutup ajakan pesan.
function productsAsText(products) {
  if (products.length === 0) return "";
  const lines = products.map((p, i) => {
    let line = `${i + 1}. *${p.nama}*\n   ${p.harga}`;
    if (p.rating) line += `  •  ★ ${p.rating}`;
    if (p.deskripsi) line += `\n   ${p.deskripsi}`;
    return line;
  });
  return `\n\n${lines.join("\n\n")}\n\nMau pesan yang mana bro? Sebut aja nomornya.`;
}

function listProducts() {
  return rag.products.map(toCard);
}

module.exports = { answer, listProducts, productsAsText, SHOP, rag };
