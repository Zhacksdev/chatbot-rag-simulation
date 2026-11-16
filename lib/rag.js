const fs = require("fs");
const path = require("path");

const CSV_PATH = path.join(__dirname, "..", "data", "products.csv");

// Maksimal produk yang dikirim ke LLM saat pengguna minta "semua produk".
// Lapak Shopee bisa punya ratusan baris; mengirim semuanya membuat prompt
// melebihi batas token dan biayanya mahal.
const ALL_PRODUCTS_LIMIT = 20;

// Kata umum yang tidak menunjuk produk apa pun. Tanpa daftar ini,
// "ada kulkas dua pintu?" ikut cocok dengan deskripsi "Dua pasang hemat!"
// lalu bot seolah punya kulkas.
const STOPWORDS = new Set([
  "ada", "apa", "aja", "saja", "yang", "dan", "atau", "dengan", "untuk", "dari",
  "dong", "deh", "sih", "nya", "juga", "lagi", "mau", "bisa", "tolong", "kak",
  "min", "gan", "bang", "punya", "jual", "beli", "cari", "gimana", "bagaimana",
  "kalau", "tapi", "satu", "dua", "tiga", "buat", "pakai", "ini", "itu", "nih",
  "tuh", "sama", "boleh", "mas", "bro", "halo", "hai"
]);

// Katalog Shopee memakai nama warna dan jenis produk bahasa Inggris, sedangkan
// pelanggan bertanya dalam bahasa Indonesia. Tanpa peta ini "sneakers putih"
// tidak menemukan apa pun, padahal ada 25 produk "White".
const SYNONYMS = {
  putih: ["white"], hitam: ["black"], merah: ["red"], biru: ["blue"],
  hijau: ["green"], kuning: ["yellow"], abu: ["grey", "gray"],
  cokelat: ["brown"], coklat: ["brown"], krem: ["cream"], ungu: ["purple"],
  emas: ["gold"], perak: ["silver"], warna: [],
  sepatu: ["shoes", "sneakers"], sandal: ["sandals", "slides"],
  tas: ["bag"], dompet: ["wallet"], topi: ["cap", "hat"],
  kaos: ["shirt", "tee"], kaki: ["socks"], celana: ["pants"],
  kemeja: ["shirt"], parfum: ["perfume"], wangi: ["perfume", "parfum"],
  sabuk: ["belt"], pinggang: ["belt"], lari: ["running"],
  olahraga: ["sport", "tennis", "padel", "soccer"]
};

// Parser CSV sesuai RFC 4180: tanda kutip, koma di dalam kutip, kutip ganda
// yang di-escape (""), dan baris baru di dalam kutip. split(",") biasa salah
// untuk data Shopee karena nama produk hampir selalu mengandung koma.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const clean = String(text).replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];

    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  row.push(field);
  rows.push(row);

  // Buang baris yang seluruh kolomnya kosong (umumnya baris terakhir file).
  return rows.filter(r => r.some(c => c.trim() !== ""));
}

// "Rp14.000 -48%" -> 14000 ; "Rp1.250.000" -> 1250000 ; "" -> null
// shortcut: harga rentang ("Rp10.000 - Rp25.000") diambil angka pertama saja,
// upgrade kalau lapak banyak memakai harga rentang.
function parsePrice(raw) {
  if (raw === undefined || raw === null) return null;
  const match = String(raw).match(/\d[\d.]*/);
  if (!match) return null;
  const num = Number(match[0].replace(/\./g, ""));
  return Number.isFinite(num) ? num : null;
}

// Format harga mengikuti situs resmi bro.do, yang memakai koma sebagai
// pemisah ribuan: "Rp 749,000".
function formatPrice(raw) {
  const num = parsePrice(raw);
  if (num === null) return String(raw || "-");
  return `Rp ${num.toLocaleString("en-US")}`;
}

class RAGEngine {
  constructor(csvPath = CSV_PATH) {
    this.csvPath = csvPath;
    this.products = [];
    this.categories = [];
    this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.csvPath)) {
        console.warn(`[RAG] File CSV tidak ditemukan: ${this.csvPath}`);
        this.products = [];
        this.categories = [];
        return this.products;
      }

      const rows = parseCsv(fs.readFileSync(this.csvPath, "utf-8"));
      if (rows.length < 2) {
        this.products = [];
        this.categories = [];
        return this.products;
      }

      // Header sudah baku karena data/products.csv selalu ditulis
      // scripts/import-csv.js. Kolom tanpa "nama" menghasilkan katalog kosong,
      // dan itu memang sinyal yang benar: datanya belum diimpor.
      const headers = rows[0].map(h => h.trim().toLowerCase());

      this.products = rows
        .slice(1)
        .map(cols => {
          const product = {};
          headers.forEach((h, i) => {
            const value = (cols[i] || "").trim();
            if (value && product[h] === undefined) product[h] = value;
          });
          product.nama = product.nama || "";
          product.kategori = product.kategori || "Lainnya";
          product.harga = product.harga || "";
          product.deskripsi = product.deskripsi || "";
          product.link = product.link || "";
          product.hargaAngka = parsePrice(product.harga);
          return product;
        })
        .filter(p => p.nama !== "");

      this.categories = [...new Set(this.products.map(p => p.kategori.toLowerCase()))];
      console.log(`[RAG] Memuat ${this.products.length} produk dari ${path.basename(this.csvPath)}`);
    } catch (err) {
      console.error("[RAG] Gagal memuat CSV:", err.message);
      this.products = [];
      this.categories = [];
    }
    return this.products;
  }

  isGreeting(query) {
    const q = String(query).toLowerCase().trim().replace(/[!.?]+$/, "");
    const greetings = [
      "halo", "hai", "hi", "hey", "hello", "p", "ping", "test", "pagi", "siang",
      "sore", "malam", "selamat pagi", "selamat siang", "selamat sore",
      "selamat malam", "assalamualaikum", "assalamu'alaikum", "permisi", "bang", "min"
    ];
    return greetings.includes(q);
  }

  isAllProductsQuery(query) {
    const q = String(query).toLowerCase().trim().replace(/[!.?]+$/, "");
    return [
      /^semua( produk(nya)?)?$/,
      /^semuanya$/,
      /^katalog( lengkap| produk)?$/,
      /^(daftar|list) (produk|harga|barang)$/,
      /^produk(nya)? (apa )?(aja|saja)$/,
      /^(apa|ada) (aja|saja)( produk(nya)?)?$/,
      /^koleksi( lengkap)?$/,
      /^jual apa( aja| saja)?$/
    ].some(re => re.test(q));
  }

  // Pecah pertanyaan jadi kata kunci: buang kata umum, lalu tambahkan
  // padanan bahasa Inggrisnya. Hasilnya unik supaya skor tidak dihitung ganda.
  tokenize(query) {
    const words = String(query)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(t => t.length > 2 && !STOPWORDS.has(t));

    const expanded = new Set();
    for (const word of words) {
      expanded.add(word);
      for (const synonym of SYNONYMS[word] || []) expanded.add(synonym);
    }
    return [...expanded];
  }

  search(query, topK = Number(process.env.RAG_TOP_K || 8)) {
    if (!query || this.products.length === 0) return [];
    const q = String(query).toLowerCase().trim();

    if (this.isGreeting(q)) return [];
    if (this.isAllProductsQuery(q)) return this.products.slice(0, ALL_PRODUCTS_LIMIT);

    // Kategori diambil dari isi CSV, bukan daftar tetap, supaya ikut berubah
    // saat data lapak diganti.
    // Ambil kategori yang paling panjang cocok, supaya "sepatu lari" tidak
    // tertangkap kategori "Sepatu" hanya karena urutan baris di CSV.
    const matchedCategory = this.categories
      .filter(cat => cat.length > 2 && q.includes(cat))
      .sort((a, b) => b.length - a.length)[0];

    const candidates = matchedCategory
      ? this.products.filter(p => p.kategori.toLowerCase() === matchedCategory)
      : this.products;

    const tokens = this.tokenize(q);
    if (tokens.length === 0) return candidates.slice(0, topK);

    const scored = candidates
      .map(p => {
        let score = 0;
        const nama = p.nama.toLowerCase();
        const kategori = p.kategori.toLowerCase();
        const deskripsi = p.deskripsi.toLowerCase();
        for (const t of tokens) {
          if (nama.includes(t)) score += 8;
          if (kategori.includes(t)) score += 5;
          if (deskripsi.includes(t)) score += 3;
        }
        return { product: p, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) return scored.slice(0, topK).map(item => item.product);
    if (matchedCategory) return candidates.slice(0, topK);
    return [];
  }

  // Susun teks katalog yang disisipkan ke dalam prompt LLM.
  buildContext(query) {
    const found = this.search(query);
    if (found.length === 0) return "";

    const grouped = {};
    for (const p of found) {
      const cat = p.kategori || "Lainnya";
      (grouped[cat] = grouped[cat] || []).push(p);
    }

    let out = `Katalog resmi (${found.length} dari total ${this.products.length} produk):\n`;
    for (const [cat, items] of Object.entries(grouped)) {
      out += `\n[${cat}]\n`;
      for (const p of items) {
        out += `- ${p.nama} | Harga: ${formatPrice(p.harga)}`;
        if (p.rating) out += ` | Rating: ${p.rating}`;
        if (p.deskripsi) out += ` | ${p.deskripsi}`;
        if (p.link) out += ` | Link: ${p.link}`;
        out += "\n";
      }
    }
    return out.trim();
  }
}

module.exports = { RAGEngine, parseCsv, parsePrice, formatPrice };
