# Brodo Official Shop — Website Katalog + Chatbot RAG + Gateway WhatsApp

Tugas Praktikum **Artificial Intelligence and Its Application** — chatbot RAG
berbasis data produk hasil scraping lapak Shopee.

- **Lapak sumber data:** [Brodo Official Shop](https://shopee.co.id/brodoofficialstore)
- **Link Vercel:** _(isi setelah deploy)_

## Ringkasan hasil

| Hal | Hasil |
| :--- | :--- |
| Data mentah hasil scraping | 125 baris, 8 kolom (`data/shopee.csv`) |
| Data siap pakai | **121 produk**, 14 kategori, 5 duplikat dibuang |
| Baris kode | 1.248 baris kode + 257 baris test |
| Uji otomatis | **28 test, semua lewat** |
| Dependensi runtime | 4 (`dotenv`, `groq-sdk`, `qrcode-terminal`, `whatsapp-web.js`) |
| Model LLM | Groq `qwen/qwen3.8-27b`, dengan 2 model cadangan |

Satu katalog (`data/products.csv`) dipakai bersama oleh website dan gateway
WhatsApp lewat satu modul jawaban (`lib/answer.js`). Tidak ada data atau logika
yang digandakan antara dua kanal itu.

## Isi tugas dan di mana dikerjakan

| Poin tugas | Berkas |
| :--- | :--- |
| 2. Scraping data produk lapak | `data/shopee.csv` (mentah) → `data/products.csv` (rapi) |
| 3. Website sederhana + deploy Vercel | `public/`, `vercel.json` |
| 4. Chatbot RAG pakai data scraping | `lib/rag.js`, `lib/answer.js`, `api/chat.js` |
| 5. Gateway WhatsApp dengan data yang sama | `wa-gateway.js` |

Website dan WhatsApp memakai **modul jawaban yang sama** (`lib/answer.js`) dan
**file data yang sama** (`data/products.csv`). Tidak ada dua sumber kebenaran:
ganti satu CSV, dua-duanya ikut berubah.

## Struktur project

```text
chatbot-rag/
├── data/shopee.csv       # CSV mentah hasil Instant Data Scraper (bukti scraping)
├── data/products.csv     # Hasil rapi, dipakai RAG (121 produk, 14 kategori)
├── scripts/import-csv.js # Ubah CSV mentah -> skema baku, sekali jalan
├── lib/rag.js            # Baca CSV, cari produk relevan, susun konteks
├── lib/answer.js         # Konteks RAG + Groq LLM -> balasan (dipakai web & WA)
├── api/chat.js           # Serverless function Vercel: POST /api/chat
├── api/products.js       # Serverless function Vercel: GET /api/products
├── public/               # Website statis (katalog + widget chat)
│   ├── index.html, style.css, app.js
│   ├── logo-brodo.webp   # Logo di header, favicon, footer
│   └── hero-running.webp # Foto hero
├── logo/logo-brodo.webp  # Logo resmi, sumber warna brand #003042
├── assets/               # Foto mentah dari situs resmi (sumber hero)
├── wa-gateway.js         # Bot WhatsApp lokal
├── dev-server.js         # Server lokal untuk uji coba sebelum deploy
└── test/
    ├── rag.test.js       # Parser CSV, harga, pencarian, sinonim warna
    ├── import.test.js    # Deteksi kolom & aturan kategori
    └── answer.test.js    # Persona, kartu produk, tombol WhatsApp
```

Alur satu pesan:

```text
Pesan (web atau WhatsApp)
   │
   ├─ sapaan / terima kasih ──► template, tanpa memanggil LLM (hemat kuota)
   │
   └─ pertanyaan lain:
         riwayat percakapan
       + konteks katalog dari data/products.csv
       + system prompt
         ──► Groq LLM ──► balasan
```

---

## Langkah 1 — Data produk hasil scraping

Data sudah terisi. Untuk mengulang atau mengganti lapak:

1. Pasang extension **Instant Data Scraper** di Chrome.
2. Buka halaman produk lapak, klik _Try another table_ sampai muncul tabel yang
   berisi nama produk dan harga, pastikan ada kolom `contents href`.
3. Atur _Locate 'Next' Button_, lalu _Start crawling_.
4. Unduh **CSV**, simpan sebagai `data/shopee.csv`.
5. Rapikan jadi skema baku:

   ```bash
   npm run import -- data/shopee.csv
   ```

Instant Data Scraper memberi nama kolom acak dari class CSS
(`whitespace-normal`, `h-4`, `_image_yazkc_11 src`), jadi nama kolomnya tidak
bisa dipercaya. Skrip impor mengenali kolom dari **isinya**: link Shopee, URL
gambar, angka harga, angka rating, lalu kolom teks terpanjang dipakai sebagai
nama produk. Kategori diturunkan dari kata kunci di nama produk.

Hasil deteksinya dicetak ke layar supaya bisa diperiksa. Keluarannya file CSV
biasa — kalau ada kategori yang meleset, perbaiki langsung di
`data/products.csv`.

Hasil untuk lapak Brodo:

```text
nama       -> kolom 2 "whitespace-normal"
harga      -> kolom 3 "font-medium 2"
link       -> kolom 0 "contents href"
gambar     -> kolom 1 "_image_yazkc_11 src"
rating     -> kolom 7 "inline-block"

121 produk ditulis (5 duplikat dibuang)
Sneakers 41, Dompet 14, Sandal 13, Topi 12, Sepatu Lari 7, Parfum 7,
Ikat Pinggang 6, Pakaian 6, Sepatu Olahraga 5, Tas 3, Kaos Kaki 3,
Boots 2, Perawatan 1, Sepatu 1
```

Skema `data/products.csv`: `nama,kategori,harga,deskripsi,link,gambar,rating`.
Harga boleh ditulis apa adanya (`616.550`, `Rp14.000 -48%`, `599000`) —
angkanya diambil otomatis.

## Langkah 2 — Konfigurasi

```bash
cp .env.example .env
```

Isi dua nilai di `.env`:

| Variabel | Isi |
| :--- | :--- |
| `GROQ_API_KEY` | Key dari <https://console.groq.com/keys> |
| `WA_NUMBER` | Nomor WhatsApp gateway, format `62xxxxxxxxxx` (tanpa `+` dan `0` di depan) |

`WA_NUMBER` dipakai tombol **PESAN** di setiap kartu produk. Tombol itu membuka
`wa.me` dengan pesan yang sudah terisi nama dan harga produknya, jadi pelanggan
tinggal tekan kirim — dan chat-nya masuk ke bot gateway kamu sendiri.

> `.env` sudah masuk `.gitignore`. Jangan pernah commit file ini.

## Langkah 3 — Jalankan di komputer sendiri

```bash
npm install
npm run dev
```

Buka <http://localhost:3000>. Katalog tampil, dan tombol 💬 di pojok kanan
bawah membuka asisten belanja.

Jalankan uji otomatis:

```bash
npm test
```

## Langkah 4 — Deploy ke Vercel

1. Push project ini ke repository GitHub.
2. Buka <https://vercel.com>, login dengan GitHub, pilih **Add New Project**.
3. **Import** repository ini. Framework Preset biarkan **Other** — Vercel
   otomatis menyajikan `public/` sebagai website dan setiap file di `api/`
   sebagai serverless function.
4. Buka **Settings → Environment Variables**, tambahkan:

   | Name | Value |
   | :--- | :--- |
   | `GROQ_API_KEY` | API key Groq Anda |
   | `GROQ_MODEL` | `qwen/qwen3.8-27b` |
   | `WA_NUMBER` | Nomor WhatsApp gateway, format `62xxxxxxxxxx` |

5. Klik **Deploy**, lalu buka URL publiknya.

> Kalau key diisi setelah deploy pertama, jalankan **Redeploy** supaya
> variabel barunya terbaca.

## Langkah 5 — Jalankan gateway WhatsApp

Gateway berjalan di komputer lokal (butuh browser aktif untuk WhatsApp Web),
jadi tidak ikut di-deploy ke Vercel.

```bash
npm run wa
```

QR Code muncul di terminal. Di HP: **WhatsApp → Perangkat tertaut → Tautkan
perangkat**, lalu pindai. Setelah muncul `Gateway WhatsApp siap`, kirim pesan
dari **nomor WhatsApp lain** untuk mengujinya.

> **Peringatan:** `whatsapp-web.js` bukan API resmi WhatsApp. Gunakan nomor
> cadangan, jangan nomor utama, dan jangan untuk pesan massal.

## Skenario pengujian

| Pesan uji | Lapisan yang menjawab | Hasil yang diharapkan |
| :--- | :--- | :--- |
| `halo` | Template | Sapaan toko, tanpa memanggil LLM |
| `ada sneakers warna putih?` | RAG + Groq | Kalimat pengantar + kartu sneakers *White* |
| `sepatu lari apa aja` | RAG + Groq | Hanya produk kategori Sepatu Lari |
| `berapa harganya?` | RAG + riwayat + Groq | Bot paham produk yang dibahas sebelumnya |
| `ada kulkas dua pintu?` | RAG + Groq | `Halo bro, produk yang kamu cari tidak ada nih.` |
| `terima kasih` | Template | Ucapan penutup, tanpa memanggil LLM |

### Cara chatbot menampilkan produk

Produk **tidak** ditulis sebagai teks oleh LLM. Yang terjadi:

1. Mesin RAG memilih produk yang cocok dari `data/products.csv`.
2. Produk itu dikirim ke browser sebagai data terstruktur, lalu digambar
   sebagai **kartu**: foto produk, nama, harga, rating, dan tombol
   **PESAN VIA WHATSAPP**.
3. LLM hanya menulis 1–2 kalimat pengantar di atas kartu.

Akibatnya harga dan nama produk tidak mungkin dikarang LLM, balasannya jauh
lebih pendek (hemat token), dan pelanggan langsung dapat tombol pesan.
Di WhatsApp kartu tidak bisa digambar, jadi produk ditulis sebagai daftar
bernomor yang rapi — bukan baris data mentah.

Persona bot: menyapa pelanggan dengan **"bro"**. Kalau produk tidak ada, bot
menjawab apa adanya tanpa mengalihkan ke toko lain.

Dua hal yang ditangani khusus karena data lapak berbahasa campuran:

- **Warna.** Katalog menulis `White`/`Black`, pelanggan menanya "putih"/"hitam".
  Kata kunci pertanyaan diterjemahkan dulu sebelum dicari.
- **Kata umum.** Tanpa penyaring, "ada kulkas **dua** pintu?" cocok dengan
  deskripsi "**Dua** pasang hemat!" dan bot seolah menjual kulkas.

## Desain

Tampilan dibuat mengikuti situs resmi <https://www.bro.do/>.

- **Warna brand `#003042`** diambil langsung dari piksel file
  `logo/logo-brodo.webp`, bukan dikira-kira. Logo yang sama dipakai di header,
  favicon, dan footer (`public/logo-brodo.webp`).
- **Sudut tajam** di semua elemen (tanpa `border-radius`), nav dan tombol
  huruf kapital dengan `letter-spacing` lebar.
- **Font Archivo** (Google Fonts) — grotesk geometris yang paling mendekati
  bentuk wordmark BRODO.
- **Kartu produk** mengikuti urutan di situs aslinya: gambar persegi, lalu
  kategori, nama, baru harga.
- **Format harga `Rp 749,000`** (koma, bukan titik) mengikuti situs aslinya.
- **Hero** memakai foto dari `assets/` (`public/hero-running.webp`) dengan
  lapisan gelap warna brand di atasnya. Lapisan itu bukan hiasan: tanpanya
  teks putih tidak terbaca di atas langit yang terang. Kepekatannya diukur,
  bukan dikira — kontras teks putih **6.78:1** pada judul dan **6.37:1** pada
  subjudul di piksel latar paling terang, keduanya lolos WCAG AA.

> Nilai CSS asli bro.do tidak bisa saya baca langsung — yang terverifikasi dari
> situsnya hanya struktur navigasi, urutan isi kartu, dan format harga. Warna
> diambil dari logo. Font dipilih sebagai padanan terdekat, bukan font asli.

## Keputusan teknis dan alasannya

Bagian ini merangkum *mengapa* sistem dibangun seperti ini, bukan sekadar *apa*.

**1. Satu modul jawaban untuk dua kanal.**
Website dan WhatsApp sama-sama memanggil `answer()` di `lib/answer.js`, dan
modul itu membaca `data/products.csv` lewat `lib/rag.js`. Alternatifnya menulis
logika terpisah di `wa-gateway.js`, tapi itu berarti dua tempat yang wajib
diubah bersamaan setiap katalog atau prompt berubah — sumber bug yang klasik.

**2. Jawaban berlapis, LLM dipanggil belakangan.**
Sapaan, ucapan terima kasih, dan pertanyaan yang tidak menemukan produk
dijawab template tanpa memanggil Groq sama sekali. Hanya pertanyaan produk yang
sampai ke LLM. Ini menghemat kuota dan membuat tiga jenis jawaban itu pasti
sama setiap kali.

**3. Produk digambar dari data, bukan ditulis LLM.**
Mesin RAG memilih produknya, lalu dikirim ke browser sebagai data terstruktur
dan digambar sebagai kartu. LLM hanya menulis 1–2 kalimat pengantar.
Konsekuensinya penting: **harga dan nama produk secara struktural tidak mungkin
dikarang LLM**, karena LLM memang tidak pernah menuliskannya.

**4. Pembersihan CSV dilakukan sekali di luar aplikasi.**
`scripts/import-csv.js` mengubah CSV mentah jadi skema baku satu kali, dan
aplikasi hanya membaca skema baku itu. Alternatifnya menebak kolom setiap kali
server start — lebih lambat, dan kesalahan deteksi jadi tersembunyi. Dengan
impor terpisah, hasil deteksinya dicetak dan bisa diperiksa manusia.

**5. Gateway WhatsApp tidak ikut di-deploy.**
`whatsapp-web.js` mengendalikan WhatsApp Web lewat browser sungguhan dan harus
hidup terus menjaga sesi. Vercel menjalankan fungsi yang mati setelah merespons,
jadi secara arsitektur gateway memang tidak bisa serverless. Website di Vercel,
gateway di komputer lokal, katalognya tetap satu.

## Masalah yang ditemukan dan perbaikannya

Ini temuan nyata selama pengembangan, bukan daftar teori.

**1. Pemisah CSV sederhana merusak data.**
Contoh kode pada modul memakai `line.split(",")`. Nama dan deskripsi produk
Shopee hampir selalu mengandung koma, misalnya `"Boots kulit asli, sol Vibram"`,
sehingga kolom bergeser dan harga terbaca sebagai potongan deskripsi.
*Perbaikan:* parser CSV sesuai RFC 4180 yang memahami tanda kutip, kutip ganda
berlapis, dan baris baru di dalam kolom.

**2. Nama kolom hasil scraper tidak bisa dipercaya.**
Instant Data Scraper memberi nama kolom dari class CSS: `whitespace-normal`,
`h-4`, `_image_yazkc_11 src`. Pemetaan berdasarkan nama kolom mustahil.
*Perbaikan:* kolom dikenali dari **isinya** — link Shopee, URL gambar, angka
harga, angka rating, dan kolom teks terpanjang sebagai nama produk. Hasilnya
6 dari 6 kolom terdeteksi benar pada data Brodo.

**3. Pertanyaan warna gagal total.**
Katalog menulis nama warna dalam bahasa Inggris, pelanggan bertanya dalam
bahasa Indonesia. Hasil pengukuran: **0 produk** mengandung kata "putih",
**25 produk** mengandung "White". Artinya pertanyaan "ada sneakers putih?"
tidak menemukan apa pun.
*Perbaikan:* peta sinonim ID→EN untuk warna dan jenis produk, diterapkan saat
memecah pertanyaan jadi kata kunci.

**4. Kata umum memicu hasil palsu.**
Pertanyaan `ada kulkas dua pintu?` mengembalikan produk kaos kaki, karena kata
"dua" cocok dengan deskripsi "Dua pasang hemat!". Bot seolah menjual kulkas.
*Perbaikan:* daftar kata umum (stopword) dibuang sebelum pencocokan.

**5. Kategori spesifik kalah oleh kategori umum.**
Pertanyaan "sepatu lari" bisa tertangkap kategori `Sepatu` hanya karena baris
itu kebetulan lebih dulu di CSV.
*Perbaikan:* kategori yang paling panjang cocok yang menang, jadi hasilnya
tidak lagi bergantung urutan data.

**6. Model LLM default tidak ada di akun.**
`llama-3.3-70b-versatile` menjawab 404 `model_not_found`, sehingga setiap pesan
membuang dua panggilan gagal sebelum sampai ke model cadangan.
*Perbaikan:* default diganti `qwen/qwen3.8-27b` setelah daftar model akun
diperiksa. Terukur **456 ms** dibanding 991 ms untuk model alternatif.

**7. LLM memparafrase kalimat baku.**
Diminta menjawab persis "Halo bro, produk yang kamu cari tidak ada nih", LLM
malah menulis "Maaf bro, kami hanya jual sepatu dan fashion pria…".
*Perbaikan:* saat tidak ada produk, LLM tidak dipanggil sama sekali.

**8. Markup WhatsApp bocor ke tampilan web.**
`*BRODO*` berarti cetak tebal di WhatsApp, tapi di browser tampil apa adanya
sebagai bintang.
*Perbaikan:* penanda tebal dibuang dari balasan bersama; format khusus
WhatsApp hanya ditambahkan di jalur WhatsApp.

## Hasil pengujian

### Uji otomatis

```bash
npm test
```

```text
ℹ tests 28
ℹ pass 28
ℹ fail 0
```

Yang diuji, dikelompokkan:

| Berkas | Fokus | Contoh kasus |
| :--- | :--- | :--- |
| `test/rag.test.js` | Parser CSV, harga, pencarian | Koma di dalam kutip tidak merusak kolom; `Rp14.000 -48%` terbaca 14000; "putih" menemukan produk *White*; "kulkas dua pintu" tidak mengembalikan apa pun |
| `test/import.test.js` | Deteksi kolom & kategori | Kolom dikenali dari isi, bukan nama; harga tidak tertukar dengan rating; "Tennis Padel **Polo**" masuk Pakaian, bukan sepatu |
| `test/answer.test.js` | Perilaku chatbot | Sapaan dijawab template; produk tidak ada dijawab kalimat baku tanpa link; setiap kartu punya tombol WhatsApp berisi nama produk |

### Uji manual lewat API

| Pesan | Lapisan | Hasil nyata |
| :--- | :--- | :--- |
| `halo` | Template | `Halo bro! Selamat datang di BRODO.` — tanpa memanggil LLM |
| `ada sneakers warna putih?` | RAG + LLM | Kalimat pengantar + 6 kartu, semua bernama *White* |
| `sandal ada apa aja bro?` | RAG + LLM | 6 kartu kategori Sandal |
| `ada kulkas dua pintu?` | Template | `Halo bro, produk yang kamu cari tidak ada nih.` |
| `terima kasih` | Template | Ucapan penutup, tanpa LLM |

### Uji tampilan

Diukur pada halaman yang sudah dirender, bukan diperkirakan:

- Lebar dokumen **390 px** pada viewport 390 px — tidak ada elemen yang melebar
  keluar layar.
- Kontras teks putih di hero: **6,78:1** (judul) dan **6,37:1** (subjudul) pada
  piksel latar paling terang. Syarat WCAG AA adalah 3:1 untuk teks besar dan
  4,5:1 untuk teks normal.

## Lampiran yang perlu disiapkan untuk laporan

1. Panel Instant Data Scraper saat *Start crawling* berjalan.
2. Isi `data/shopee.csv` (kolom berantakan) dan `data/products.csv` (sudah rapi).
3. Keluaran terminal `npm run import -- data/shopee.csv` — menunjukkan kolom
   mana yang terdeteksi jadi apa.
4. Keluaran `npm test` memperlihatkan 28/28 lewat.
5. Halaman website: hero, katalog, dan panel chat yang menampilkan kartu produk.
6. Terminal `npm run wa` saat QR muncul, dan saat `Gateway WhatsApp siap`.
7. Percakapan WhatsApp dari nomor lain untuk tiap skenario di tabel uji manual.
8. URL publik Vercel dan link lapak Shopee.

## Troubleshooting

| Masalah | Solusi |
| :--- | :--- |
| Katalog kosong di website | `data/products.csv` belum dibuat. Jalankan `npm run import -- data/shopee.csv`. |
| Kategori produk banyak yang meleset | Tambah kata kunci di `CATEGORY_RULES` pada `scripts/import-csv.js`, jalankan ulang impor. |
| Tombol PESAN / CHAT WHATSAPP tidak muncul | `WA_NUMBER` belum diisi di `.env` (dan di Vercel). Tombolnya sengaja disembunyikan daripada mengarah ke nomor kosong. |
| Balasan bot terasa datar / tanpa pengantar | `GROQ_API_KEY` belum diisi atau semua model gagal; bot memakai kalimat cadangan. Cek log terminal. |
| Di Vercel chat gagal, lokal jalan | Environment Variable belum diisi di Vercel, atau belum Redeploy. |
| Bot sudah terhubung tapi diam saat dikirimi pesan | Lihat terminal. Kalau tidak ada baris `[masuk ...]` sama sekali, pesannya tidak sampai ke bot — pastikan mengirim dari **nomor WhatsApp lain**, bukan dari nomor bot itu sendiri. Kalau ada `[masuk ...]` tapi tidak ada `[balas ...]`, nomornya tersaring; kirimkan isi baris itu. |
| `TimeoutError: Waiting failed: 30000ms exceeded` saat `npm run wa` | Profil Chrome di `.wwebjs_auth/` rusak (biasanya karena proses sebelumnya terbunuh paksa), sehingga WhatsApp Web tidak pernah booting. **Hapus folder `.wwebjs_auth/`**, lalu `npm run wa` dan pindai QR dari awal. |
| `ProtocolError: Target closed` saat `npm run wa` | Chrome dari sesi sebelumnya nyangkut. Tutup prosesnya, hapus folder `.wwebjs_auth/`, jalankan ulang. |
| Gateway berhenti sendiri setelah ditutup paksa | Hentikan dengan `Ctrl+C` supaya sesi ditutup rapi. Menutup jendela terminal langsung bisa merusak profil Chrome-nya. |
| Model Groq ditolak | Ganti `GROQ_MODEL` dengan model yang aktif di console Groq. |

## Catatan batasan

- Endpoint `/api/chat` publik dan belum punya rate limit lintas instance
  (butuh Redis/KV). Pengaman saat ini hanya batas panjang pesan dan riwayat.
  Pantau kuota Groq selama link Vercel dibagikan.
- Saat pengguna minta "semua produk", maksimal 20 produk dikirim ke LLM agar
  prompt tidak melebihi batas token. Katalog penuh tetap tampil di website.
- Harga rentang (`Rp10.000 - Rp25.000`) diambil angka pertamanya.
- Kategori diturunkan dari kata kunci di nama produk, jadi lapak dengan gaya
  penamaan berbeda perlu penyesuaian `CATEGORY_RULES`.
- Data produk adalah salinan hasil scraping pada satu waktu. Harga dan stok di
  Shopee bisa berubah setelahnya; jalankan ulang scraping untuk menyegarkan.

## Kesimpulan

Sistem berhasil memenuhi keempat poin tugas: data produk lapak Shopee berhasil
di-scraping dan dirapikan menjadi 121 produk, website katalog siap di-deploy ke
Vercel, chatbot menjawab berdasarkan data produk tersebut, dan gateway WhatsApp
memakai katalog yang sama persis.

Dua hal yang paling menentukan kualitas jawaban ternyata bukan pada sisi LLM,
melainkan pada **penyiapan data dan pencarian**: parser CSV yang benar, dan
pencocokan kata kunci yang sadar perbedaan bahasa antara pertanyaan pelanggan
(Indonesia) dan penamaan produk (Inggris). Tanpa dua hal itu, LLM sekuat apa
pun tetap menjawab dari konteks yang salah atau kosong.

Keputusan memisahkan penulisan kartu produk dari keluaran LLM membuat kesalahan
harga menjadi tidak mungkin secara struktur, bukan sekadar dicegah lewat
instruksi prompt — pendekatan yang lebih dapat diandalkan untuk kasus yang
menyangkut angka dan harga.
