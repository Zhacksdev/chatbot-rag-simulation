const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { RAGEngine, parseCsv, parsePrice } = require("../lib/rag");

test("parseCsv menjaga koma di dalam tanda kutip", () => {
  const rows = parseCsv('nama,harga\n"Sepatu Boots, Kulit Asli",Rp899.000');
  assert.deepStrictEqual(rows[1], ["Sepatu Boots, Kulit Asli", "Rp899.000"]);
});

test("parseCsv menangani kutip ganda dan baris baru di dalam kolom", () => {
  const rows = parseCsv('a,b\n"kata ""kunci""","baris1\nbaris2"');
  assert.strictEqual(rows[1][0], 'kata "kunci"');
  assert.strictEqual(rows[1][1], "baris1\nbaris2");
});

test("parsePrice membaca format harga Shopee", () => {
  assert.strictEqual(parsePrice("Rp14.000 -48%"), 14000);
  assert.strictEqual(parsePrice("Rp1.250.000"), 1250000);
  assert.strictEqual(parsePrice("599000"), 599000);
  assert.strictEqual(parsePrice(""), null);
  assert.strictEqual(parsePrice("stok habis"), null);
});

function fixtureEngine(csv) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rag-")), "products.csv");
  fs.writeFileSync(file, csv, "utf-8");
  return new RAGEngine(file);
}

const SAMPLE = [
  "nama,kategori,harga,deskripsi,link",
  'Sepatu Boots Signore,Boots,Rp899.000,"Boots kulit asli, sol Vibram",https://shopee.co.id/x',
  "Sepatu Sneakers Draven,Sneakers,Rp599.000,Sneakers putih harian,https://shopee.co.id/y",
  "Dompet Kulit Bifold,Aksesoris,Rp199.000,Dompet lipat kulit asli,https://shopee.co.id/z"
].join("\n");

test("memuat produk dan kategori dari CSV", () => {
  const rag = fixtureEngine(SAMPLE);
  assert.strictEqual(rag.products.length, 3);
  assert.strictEqual(rag.products[0].deskripsi, "Boots kulit asli, sol Vibram");
  assert.strictEqual(rag.products[0].hargaAngka, 899000);
  assert.deepStrictEqual(rag.categories.sort(), ["aksesoris", "boots", "sneakers"]);
});

test("CSV tanpa kolom nama menghasilkan katalog kosong, bukan nama produk palsu", () => {
  // Header mentah hasil scraper tidak lagi diterjemahkan di sini: itu tugas
  // scripts/import-csv.js. Katalog kosong adalah sinyal "data belum diimpor".
  const rag = fixtureEngine('title,price,contents href\nSandal Slide,299.000,https://shopee.co.id/a');
  assert.strictEqual(rag.products.length, 0);
});

test("sapaan tidak memicu katalog", () => {
  const rag = fixtureEngine(SAMPLE);
  assert.deepStrictEqual(rag.search("halo"), []);
  assert.strictEqual(rag.buildContext("halo"), "");
});

test("pencarian menemukan produk yang relevan saja", () => {
  const rag = fixtureEngine(SAMPLE);
  const hasil = rag.search("ada dompet kulit?");
  // Boots ikut muncul karena deskripsinya menyebut "kulit"; yang penting
  // produk paling cocok ada di urutan pertama.
  assert.strictEqual(hasil[0].nama, "Dompet Kulit Bifold");
  assert.ok(hasil.length < 3, "produk yang sama sekali tidak relevan tidak ikut terbawa");
});

test("permintaan katalog mengembalikan semua produk", () => {
  const rag = fixtureEngine(SAMPLE);
  assert.strictEqual(rag.search("semua produk").length, 3);
  assert.strictEqual(rag.search("katalog").length, 3);
});

test("produk yang tidak ada menghasilkan konteks kosong", () => {
  const rag = fixtureEngine(SAMPLE);
  assert.strictEqual(rag.buildContext("ada kulkas dua pintu?"), "");
});

test("konteks memuat harga dalam Rupiah dan link", () => {
  const rag = fixtureEngine(SAMPLE);
  const context = rag.buildContext("sneakers");
  assert.match(context, /Sepatu Sneakers Draven/);
  // Format harga mengikuti bro.do: koma sebagai pemisah ribuan.
  assert.match(context, /Rp 599,000/);
  assert.match(context, /https:\/\/shopee\.co\.id\/y/);
});

// Data bergaya hasil scraping asli: nama warna bahasa Inggris, dan deskripsi
// yang mengandung kata umum bahasa Indonesia.
const SCRAPED = [
  "nama,kategori,harga,deskripsi,link",
  "BRODO - Sneakers Calcio All White,Sneakers,616.550,Gaya y2k!,https://shopee.co.id/a",
  "BRODO - Sneakers Ace Nova Black,Sneakers,503.200,Desain stylish!,https://shopee.co.id/b",
  "BRODO - Running Shoes Active Inizio White,Sepatu Lari,799.000,Ringan dipakai,https://shopee.co.id/c",
  "BRODO - Dompet Waga Wallet Black,Dompet,249.000,Kulit asli,https://shopee.co.id/d",
  "BRODO - Anzi Comfy Ankle Socks Pack of 2,Kaos Kaki,99.000,Dua pasang hemat!,https://shopee.co.id/e",
  "BRODO - Sepatu Formal Lusso Brown,Sepatu,899.000,Kulit sapi,https://shopee.co.id/f"
].join("\n");

test("kata umum tidak memicu hasil palsu", () => {
  const rag = fixtureEngine(SCRAPED);
  // "dua" ada di deskripsi "Dua pasang hemat!", tapi pelanggan menanyakan
  // kulkas — katalog tidak punya kulkas, jadi hasilnya harus kosong.
  assert.deepStrictEqual(rag.search("ada kulkas dua pintu?"), []);
  assert.strictEqual(rag.buildContext("ada kulkas dua pintu?"), "");
});

test("warna bahasa Indonesia menemukan nama produk bahasa Inggris", () => {
  const rag = fixtureEngine(SCRAPED);
  const putih = rag.search("ada sneakers warna putih?");
  assert.ok(putih.length > 0, "harus menemukan produk White");
  assert.match(putih[0].nama, /White/);

  const hitam = rag.search("dompet hitam");
  assert.match(hitam[0].nama, /Black/);
});

test("kategori paling panjang yang menang, bukan urutan di CSV", () => {
  const rag = fixtureEngine(SCRAPED);
  const hasil = rag.search("sepatu lari apa aja");
  // "sepatu" juga kategori yang ada, tapi "sepatu lari" lebih spesifik.
  assert.ok(hasil.every(p => p.kategori === "Sepatu Lari"), "semua hasil harus Sepatu Lari");
});

test("CSV kosong atau hilang tidak membuat crash", () => {
  assert.strictEqual(fixtureEngine("nama,harga").products.length, 0);
  const missing = new RAGEngine(path.join(os.tmpdir(), "tidak-ada-file-xyz.csv"));
  assert.deepStrictEqual(missing.search("sepatu"), []);
});
