// Gateway WhatsApp. Memakai lib/answer.js yang sama persis dengan website,
// jadi jawaban di WhatsApp dan di web berasal dari satu katalog yang sama
// (data/products.csv).
require("dotenv").config();

const fs = require("fs");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { answer, productsAsText, SHOP, rag } = require("./lib/answer");

// Yang diabaikan cuma grup, status, broadcast, dan channel. Sisanya dianggap
// chat pribadi — WhatsApp memakai @c.us maupun @lid untuk itu, jadi memilih
// jenis nomor yang "boleh" (allow-list) membuat bot diam diam-diam setiap
// WhatsApp menambah jenis baru.
function isGroupOrBroadcast(from) {
  return /@g\.us$|@broadcast$|@newsletter$/.test(String(from || ""));
}

// Chromium bawaan Puppeteer sengaja tidak diunduh (lihat .puppeteerrc.cjs),
// jadi gateway memakai Chrome yang sudah ada di komputer.
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser"
  ].filter(Boolean);

  const found = candidates.find(p => fs.existsSync(p));
  if (!found) {
    console.error(
      "Chrome tidak ditemukan. Pasang Google Chrome, atau isi CHROME_PATH di .env\n" +
        "contoh: CHROME_PATH=C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    );
    process.exit(1);
  }
  return found;
}

const MAX_HISTORY = 6; // 3 giliran tanya-jawab per nomor
const SESSION_TTL_MS = 20 * 60 * 1000; // riwayat hangus setelah 20 menit diam

// Riwayat per nomor pengirim. Sesi lama dibuang berkala supaya memori tidak
// terus bertambah selama bot menyala berhari-hari.
const sessions = new Map();

function getHistory(from) {
  const session = sessions.get(from);
  if (!session) return [];
  if (Date.now() - session.lastActive > SESSION_TTL_MS) {
    sessions.delete(from);
    return [];
  }
  return session.messages;
}

function saveHistory(from, userMsg, botReply) {
  const session = sessions.get(from) || { messages: [], lastActive: 0 };
  session.messages.push({ role: "user", content: userMsg });
  session.messages.push({ role: "assistant", content: botReply });
  session.messages = session.messages.slice(-MAX_HISTORY);
  session.lastActive = Date.now();
  sessions.set(from, session);
}

setInterval(() => {
  const now = Date.now();
  for (const [from, session] of sessions) {
    if (now - session.lastActive > SESSION_TTL_MS) sessions.delete(from);
  }
}, SESSION_TTL_MS).unref();

const client = new Client({
  authStrategy: new LocalAuth({ clientId: "brodo-rag" }),
  puppeteer: {
    headless: true,
    executablePath: findChrome(),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  }
});

client.on("qr", qr => {
  console.log("\n=============== PINDAI QR WHATSAPP ===============");
  qrcode.generate(qr, { small: true });
  console.log("WhatsApp di HP > Perangkat tertaut > Tautkan perangkat\n");
});

client.on("authenticated", () => console.log("Autentikasi WhatsApp berhasil."));
client.on("auth_failure", msg => console.error("Autentikasi gagal:", msg));

client.on("ready", () => {
  console.log(`Gateway WhatsApp siap untuk ${SHOP.name}.`);
  console.log(`Katalog aktif: ${rag.products.length} produk.`);
});

client.on("disconnected", reason => console.log("WhatsApp terputus:", reason));

client.on("message", async msg => {
  if (msg.fromMe) return;

  const from = String(msg.from || "");
  const text = String(msg.body || "").trim();

  // Dicatat sebelum disaring, supaya kalau bot diam kita bisa lihat nomor
  // seperti apa yang sebenarnya masuk.
  console.log(`[masuk ${from}] ${text.slice(0, 60)}`);

  if (isGroupOrBroadcast(from)) return;
  if (!text) return;

  try {
    const { reply, products, source } = await answer(text, getHistory(msg.from));
    const full = reply + productsAsText(products);
    await msg.reply(full);
    saveHistory(msg.from, text, reply);
    console.log(`[balas ${source}] ${products.length} produk | ${reply.slice(0, 60)}…`);
  } catch (err) {
    console.error("Gagal memproses pesan:", err.message);
    try {
      await msg.reply("Waduh bro, sistemnya lagi bermasalah. Coba chat lagi sebentar ya.");
    } catch (replyErr) {
      console.error("Gagal mengirim pesan error:", replyErr.message);
    }
  }
});

async function shutdown(signal) {
  console.log(`\n${signal} diterima, menutup browser…`);
  try {
    await client.destroy();
  } catch (err) {
    // Browser mungkin sudah tertutup.
  }
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

module.exports = { isGroupOrBroadcast };

// Hanya menyalakan bot kalau dijalankan langsung, supaya test bisa memakai
// fungsi di atas tanpa ikut membuka browser (pola yang sama dipakai
// scripts/import-csv.js).
if (require.main !== module) return;

client.initialize().catch(err => {
  console.error("\nGagal memulai gateway:", err.message);
  // Penyebab tersering: profil Chrome di .wwebjs_auth rusak karena proses
  // sebelumnya terbunuh paksa, sehingga WhatsApp Web tidak pernah booting dan
  // whatsapp-web.js menyerah setelah 30 detik.
  if (/Waiting failed|TimeoutError/i.test(err.message)) {
    console.error(
      "\nSesi WhatsApp kemungkinan rusak. Hapus folder .wwebjs_auth lalu\n" +
      "jalankan ulang 'npm run wa' dan pindai QR dari awal.\n"
    );
  }
  process.exit(1);
});
