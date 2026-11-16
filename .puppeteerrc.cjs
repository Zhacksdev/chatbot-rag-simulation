// Chromium bawaan Puppeteer tidak diunduh.
// - Vercel tidak menjalankan browser sama sekali (website hanya statis + API).
// - Gateway WhatsApp lokal memakai Chrome yang sudah terpasang di komputer,
//   lihat CHROME_PATH di .env.example.
module.exports = { skipDownload: true };
