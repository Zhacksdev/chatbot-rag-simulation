// Ubah CSV mentah hasil Instant Data Scraper menjadi data/products.csv
// dengan skema baku: nama,kategori,harga,deskripsi,link,gambar,rating
//
// Pakai:  npm run import -- data/shopee.csv
//
// Nama kolom hasil scraper acak (contoh: "whitespace-normal", "h-4"), jadi
// kolom dikenali dari ISI-nya, bukan dari judul kolomnya. Hasilnya dicetak
// supaya bisa diperiksa, dan file keluarannya boleh diedit manual.
const fs = require("fs");
const path = require("path");
const { parseCsv, parsePrice } = require("../lib/rag");

const SAMPLE_SIZE = 40;

// Kata kunci dicek berurutan, yang cocok pertama dipakai.
// "kaos kaki" harus sebelum "kaos", "sepatu" paling akhir di antara alas kaki.
const CATEGORY_RULES = [
  [/kaos kaki|socks/i, "Kaos Kaki"],
  [/parfum|perfume|eau de|\bedt\b/i, "Parfum"],
  // Pakaian dicek sebelum sepatu olahraga: "Tennis Padel Polo" itu kaos polo,
  // bukan sepatu.
  [/jersey|\bpolo\b|kaos|broshirt|t-?shirt|\btee\b|kemeja|jaket|celana/i, "Pakaian"],
  [/sneakers/i, "Sneakers"],
  [/tennis|padel|soccer|futsal/i, "Sepatu Olahraga"],
  [/running|lari/i, "Sepatu Lari"],
  [/boots?\b/i, "Boots"],
  [/loafer|slip[- ]?on/i, "Loafers"],
  [/sandal|slides?|broslides/i, "Sandal"],
  [/dompet|wallet/i, "Dompet"],
  [/topi|\bcap\b|\bhat\b/i, "Topi"],
  [/\btas\b|\bbag\b|pouch|sling|backpack/i, "Tas"],
  [/ikat pinggang|\bbelt\b/i, "Ikat Pinggang"],
  [/comb|sisir|semir|shoe care|cleaner|brush|perawatan/i, "Perawatan"],
  [/sepatu|shoes/i, "Sepatu"]
];

function categoryOf(name) {
  const rule = CATEGORY_RULES.find(([pattern]) => pattern.test(name));
  return rule ? rule[1] : "Lainnya";
}

function sampleOf(rows, index) {
  return rows
    .map(r => (r[index] || "").trim())
    .filter(Boolean)
    .slice(0, SAMPLE_SIZE);
}

function mostly(values, test) {
  if (values.length === 0) return false;
  return values.filter(test).length / values.length > 0.8;
}

// Tentukan peran tiap kolom dari isinya.
function detectColumns(header, rows) {
  const roles = {};
  const textColumns = [];

  header.forEach((_, i) => {
    const values = sampleOf(rows, i);
    if (values.length === 0) return;

    if (mostly(values, v => /^https?:\/\//i.test(v))) {
      const isShop = mostly(values, v => /shopee\.co\.id/i.test(v));
      roles[isShop ? "link" : "gambar"] = i;
      return;
    }
    if (mostly(values, v => /^-\d+%$/.test(v))) return; // kolom diskon, dilewati
    if (mostly(values, v => /^[0-5](\.\d+)?$/.test(v))) {
      roles.rating = i;
      return;
    }
    if (mostly(values, v => /^\d[\d.]*$/.test(v) && parsePrice(v) >= 1000)) {
      roles.harga = i;
      return;
    }

    const avgLength = values.reduce((sum, v) => sum + v.length, 0) / values.length;
    textColumns.push({ index: i, avgLength });
  });

  // Kolom teks terpanjang hampir selalu nama produk; sisanya jadi deskripsi.
  textColumns.sort((a, b) => b.avgLength - a.avgLength);
  if (textColumns.length > 0) roles.nama = textColumns[0].index;
  roles.deskripsi = textColumns.slice(1).map(c => c.index);

  return roles;
}

function csvEscape(value) {
  const text = String(value == null ? "" : value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function main() {
  const input = process.argv[2];
  const output = process.argv[3] || path.join(__dirname, "..", "data", "products.csv");

  if (!input) {
    console.error("Pakai: npm run import -- data/shopee.csv");
    process.exit(1);
  }
  if (!fs.existsSync(input)) {
    console.error(`File tidak ditemukan: ${input}`);
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(input, "utf-8"));
  if (rows.length < 2) {
    console.error("CSV tidak punya baris data.");
    process.exit(1);
  }

  const [header, ...data] = rows;
  const roles = detectColumns(header, data);

  if (roles.nama === undefined) {
    console.error("Tidak menemukan kolom nama produk. Rapikan CSV secara manual.");
    process.exit(1);
  }

  console.log("Kolom yang terdeteksi:");
  for (const key of ["nama", "harga", "link", "gambar", "rating"]) {
    const i = roles[key];
    console.log(`  ${key.padEnd(10)} -> ${i === undefined ? "(tidak ada)" : `kolom ${i} "${header[i]}"`}`);
  }
  console.log(
    `  deskripsi  -> ${
      roles.deskripsi.length ? roles.deskripsi.map(i => `"${header[i]}"`).join(" + ") : "(tidak ada)"
    }`
  );

  const pick = (row, i) => (i === undefined ? "" : (row[i] || "").trim());

  const products = data
    .map(row => {
      const nama = pick(row, roles.nama);
      if (!nama) return null;
      return {
        nama,
        kategori: categoryOf(nama),
        harga: pick(row, roles.harga),
        deskripsi: roles.deskripsi.map(i => pick(row, i)).filter(Boolean).join(" · "),
        link: pick(row, roles.link),
        gambar: pick(row, roles.gambar),
        rating: pick(row, roles.rating)
      };
    })
    .filter(Boolean);

  // Buang produk kembar (scraper sering mengulang baris antar halaman).
  const seen = new Set();
  const unique = products.filter(p => {
    const key = p.link || p.nama;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const columns = ["nama", "kategori", "harga", "deskripsi", "link", "gambar", "rating"];
  const csv = [
    columns.join(","),
    ...unique.map(p => columns.map(c => csvEscape(p[c])).join(","))
  ].join("\n");

  fs.writeFileSync(output, csv + "\n", "utf-8");

  const counts = {};
  for (const p of unique) counts[p.kategori] = (counts[p.kategori] || 0) + 1;

  console.log(`\n${unique.length} produk ditulis ke ${output}` +
    (products.length !== unique.length ? ` (${products.length - unique.length} duplikat dibuang)` : ""));
  console.log("Kategori:", Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", "));
  console.log("\nPeriksa hasilnya, perbaiki manual kalau ada kategori yang meleset.");
}

if (require.main === module) main();

module.exports = { categoryOf, detectColumns, csvEscape };
