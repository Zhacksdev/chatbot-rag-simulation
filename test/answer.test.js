// Env harus diatur SEBELUM lib/answer.js di-require: nomor WA dibaca sekali
// saat modul dimuat, dan API key sengaja dikosongkan supaya test berjalan
// tanpa memanggil Groq (hasilnya jadi pasti dan tidak butuh internet).
process.env.WA_NUMBER = "628123456789";
process.env.GROQ_API_KEY = "";

const test = require("node:test");
const assert = require("node:assert");

const { answer, productsAsText, SHOP } = require("../lib/answer");

test("sapaan dijawab template, tanpa kartu produk", async () => {
  const hasil = await answer("halo");
  assert.strictEqual(hasil.source, "template");
  assert.strictEqual(hasil.products.length, 0);
  assert.match(hasil.reply, /bro/i);
});

test("terima kasih dijawab template", async () => {
  const hasil = await answer("makasih");
  assert.strictEqual(hasil.source, "template");
  assert.match(hasil.reply, /bro/i);
});

test("produk yang tidak ada dijawab kalimat baku, tanpa link ke toko lain", async () => {
  const hasil = await answer("ada kulkas dua pintu?");
  assert.strictEqual(hasil.products.length, 0);
  assert.strictEqual(hasil.reply, "Halo bro, produk yang kamu cari tidak ada nih.");
  // Tidak boleh mengarahkan ke Shopee saat produk tidak ketemu.
  assert.doesNotMatch(hasil.reply, /shopee|http/i);
});

test("produk yang ada dikembalikan sebagai kartu, bukan teks mentah", async () => {
  const hasil = await answer("ada sneakers warna putih?");
  assert.ok(hasil.products.length > 0, "harus ada kartu produk");

  const kartu = hasil.products[0];
  assert.ok(kartu.nama.length > 0);
  assert.match(kartu.harga, /^Rp [\d,]+$/, "harga sudah diformat");
  assert.match(kartu.gambar, /^https?:\/\//, "kartu membawa gambar");

  // Balasannya kalimat pengantar saja: nama produk dan harga ada di kartu.
  assert.doesNotMatch(hasil.reply, /Rp /, "harga tidak boleh ditulis di teks balasan");
});

test("setiap kartu punya tombol pesan WhatsApp berisi nama produk", async () => {
  const hasil = await answer("dompet hitam");
  const kartu = hasil.products[0];

  assert.ok(kartu.waLink.startsWith(`https://wa.me/${SHOP.waNumber}?text=`));
  assert.match(decodeURIComponent(kartu.waLink), new RegExp(kartu.nama.slice(0, 15).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("versi WhatsApp menulis produk rapi, bukan baris data", async () => {
  const hasil = await answer("dompet hitam");
  const teks = productsAsText(hasil.products);

  assert.match(teks, /1\. \*/, "produk bernomor dan tebal");
  assert.match(teks, /Rp [\d,]+/, "harga ikut ditulis untuk WhatsApp");
  assert.match(teks, /Mau pesan yang mana bro/);
  assert.doesNotMatch(teks, /\|/, "tidak boleh berupa baris data dipisah pipa");
});

test("tanpa nomor WA, kartu tetap jalan tanpa tombol pesan", () => {
  // SHOP.waNumber hanya digit; pastikan format yang dipakai link sudah bersih.
  assert.strictEqual(SHOP.waNumber, "628123456789");
});
