const grid = document.getElementById("productGrid");
const chips = document.getElementById("categoryChips");
const searchBox = document.getElementById("searchBox");
const statTotal = document.getElementById("statTotal");
const statCategories = document.getElementById("statCategories");
const statRange = document.getElementById("statRange");

const chatToggle = document.getElementById("chatToggle");
const chatPanel = document.getElementById("chatPanel");
const chatClose = document.getElementById("chatClose");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatSend = document.getElementById("chatSend");
const chatLog = document.getElementById("chatLog");
const heroCta = document.getElementById("heroCta");
const heroWa = document.getElementById("heroWa");

let products = [];
let activeCategory = "Semua";
let history = [];

// Format harga mengikuti bro.do: "Rp 749,000"
const rupiah = n => `Rp ${Number(n).toLocaleString("en-US")}`;

/* ---------- Katalog ---------- */

async function loadProducts() {
  try {
    const res = await fetch("/api/products");
    if (!res.ok) throw new Error("Gagal memuat produk");
    const data = await res.json();
    products = data.products || [];

    const shop = data.shop || {};
    if (shop.url) {
      document.getElementById("shopLink").href = shop.url;
      document.getElementById("footerShopLink").href = shop.url;
    }

    // Tombol WhatsApp di hero. Disembunyikan kalau WA_NUMBER belum diisi,
    // supaya tidak ada tombol yang mengarah ke nomor kosong.
    if (heroWa) {
      if (shop.waNumber) {
        const pesan = `Halo ${shop.name || "BRODO"}, saya mau tanya produk.`;
        heroWa.href = `https://wa.me/${shop.waNumber}?text=${encodeURIComponent(pesan)}`;
      } else {
        heroWa.classList.add("hidden");
      }
    }

    renderStats();
    renderChips();
    renderGrid();
  } catch (err) {
    grid.className = "muted";
    grid.textContent = "Gagal memuat produk. Pastikan server berjalan.";
  }
}

function renderStats() {
  const categories = [...new Set(products.map(p => p.kategori))];
  const prices = products.map(p => p.hargaAngka).filter(n => typeof n === "number" && n > 0);

  statTotal.textContent = products.length;
  statCategories.textContent = categories.length;
  statRange.textContent = prices.length
    ? `${rupiah(Math.min(...prices))} – ${rupiah(Math.max(...prices))}`
    : "—";
}

function renderChips() {
  const categories = ["Semua", ...new Set(products.map(p => p.kategori))];
  chips.replaceChildren();

  for (const cat of categories) {
    const btn = document.createElement("button");
    btn.className = "chip" + (cat === activeCategory ? " active" : "");
    btn.textContent = cat;
    btn.onclick = () => {
      activeCategory = cat;
      renderChips();
      renderGrid();
    };
    chips.appendChild(btn);
  }
}

// textContent dipakai di mana-mana: data produk berasal dari hasil scraping,
// jadi tidak boleh disisipkan sebagai HTML mentah.
function productCard(p) {
  const card = document.createElement("article");
  card.className = "card";

  const imgWrap = document.createElement("div");
  imgWrap.className = "card-imgwrap";
  if (/^https?:\/\//i.test(p.gambar)) {
    const img = document.createElement("img");
    img.className = "card-img";
    img.src = p.gambar;
    img.alt = p.nama;
    img.loading = "lazy";
    imgWrap.appendChild(img);
  }

  const cat = document.createElement("div");
  cat.className = "card-cat";
  cat.textContent = p.kategori;

  const title = document.createElement("h3");
  title.textContent = p.nama;

  const price = document.createElement("div");
  price.className = "card-price";
  price.textContent = p.harga;

  card.append(imgWrap, cat, title, price);

  if (p.rating) {
    const rating = document.createElement("div");
    rating.className = "card-rating";
    rating.textContent = `★ ${p.rating}`;
    card.appendChild(rating);
  }

  const actions = document.createElement("div");
  actions.className = "card-actions";

  if (/^https?:\/\//i.test(p.waLink)) {
    const wa = document.createElement("a");
    wa.className = "btn-wa";
    wa.href = p.waLink;
    wa.target = "_blank";
    wa.rel = "noopener";
    wa.textContent = "PESAN";
    actions.appendChild(wa);
  }
  if (/^https?:\/\//i.test(p.link)) {
    const detail = document.createElement("a");
    detail.className = "btn-ghost";
    detail.href = p.link;
    detail.target = "_blank";
    detail.rel = "noopener";
    detail.textContent = "DETAIL";
    actions.appendChild(detail);
  }
  if (actions.children.length > 0) card.appendChild(actions);

  return card;
}

function renderGrid() {
  const term = searchBox.value.trim().toLowerCase();

  const shown = products.filter(p => {
    const byCategory = activeCategory === "Semua" || p.kategori === activeCategory;
    const byTerm =
      !term ||
      p.nama.toLowerCase().includes(term) ||
      p.deskripsi.toLowerCase().includes(term);
    return byCategory && byTerm;
  });

  grid.className = "grid";
  grid.replaceChildren();

  if (shown.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Tidak ada produk yang cocok.";
    grid.appendChild(empty);
    return;
  }

  for (const p of shown) grid.appendChild(productCard(p));
}

searchBox.addEventListener("input", renderGrid);

document.querySelectorAll(".navlink").forEach(btn => {
  btn.onclick = () => {
    activeCategory = btn.dataset.jump;
    searchBox.value = "";
    renderChips();
    renderGrid();
    document.getElementById("catalogTitle").scrollIntoView({ behavior: "smooth", block: "start" });
  };
});

/* ---------- Chat ---------- */

function addBubble(text, who, extraClass = "") {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${who} ${extraClass}`.trim();

  // Ubah URL jadi tautan tanpa pernah menyisipkan HTML mentah.
  const parts = String(text).split(/(https?:\/\/[^\s)]+)/g);
  for (const part of parts) {
    if (/^https?:\/\//i.test(part)) {
      const a = document.createElement("a");
      a.href = part;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = part;
      bubble.appendChild(a);
    } else if (part) {
      bubble.appendChild(document.createTextNode(part));
    }
  }

  chatLog.appendChild(bubble);
  chatLog.scrollTop = chatLog.scrollHeight;
  return bubble;
}

// Produk ditampilkan sebagai kartu (gambar, nama, harga, tombol pesan),
// bukan baris data mentah di dalam teks balasan.
function addProductCards(items) {
  if (!items || items.length === 0) return;

  const list = document.createElement("div");
  list.className = "chat-cards";

  for (const p of items) {
    const card = document.createElement("div");
    card.className = "chat-card";

    if (/^https?:\/\//i.test(p.gambar)) {
      const img = document.createElement("img");
      img.className = "chat-card-img";
      img.src = p.gambar;
      img.alt = p.nama;
      img.loading = "lazy";
      card.appendChild(img);
    }

    const body = document.createElement("div");
    body.className = "chat-card-body";

    const name = document.createElement("div");
    name.className = "chat-card-name";
    name.textContent = p.nama;

    const price = document.createElement("div");
    price.className = "chat-card-price";
    price.textContent = p.harga;

    body.append(name, price);

    if (p.rating || p.kategori) {
      const meta = document.createElement("div");
      meta.className = "chat-card-meta";
      meta.textContent = [p.kategori, p.rating ? `★ ${p.rating}` : ""].filter(Boolean).join("  •  ");
      body.appendChild(meta);
    }

    if (/^https?:\/\//i.test(p.waLink)) {
      const wa = document.createElement("a");
      wa.className = "chat-card-wa";
      wa.href = p.waLink;
      wa.target = "_blank";
      wa.rel = "noopener";
      wa.textContent = "PESAN VIA WHATSAPP";
      body.appendChild(wa);
    }

    card.appendChild(body);
    list.appendChild(card);
  }

  chatLog.appendChild(list);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function openChat() {
  chatPanel.classList.remove("hidden");
  if (chatLog.children.length === 0) {
    addBubble(
      "Halo bro! Mau cari apa hari ini? Sneakers, sandal, dompet, atau parfum tinggal sebut aja.",
      "bot"
    );
  }
  chatInput.focus();
}

chatToggle.onclick = () => {
  if (chatPanel.classList.contains("hidden")) openChat();
  else chatPanel.classList.add("hidden");
};
chatClose.onclick = () => chatPanel.classList.add("hidden");
if (heroCta) heroCta.onclick = openChat;

chatForm.onsubmit = async event => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;

  addBubble(message, "user");
  chatInput.value = "";
  chatSend.disabled = true;
  const typing = addBubble("Mengetik…", "bot", "typing");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history })
    });
    const data = await res.json();
    typing.remove();

    const reply = data.reply || data.error || "Waduh bro, sistemnya lagi bermasalah.";
    addBubble(reply, "bot");
    addProductCards(data.products);

    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: reply });
    history = history.slice(-6);
  } catch (err) {
    typing.remove();
    addBubble("Gagal menghubungi asisten bro. Cek koneksi, lalu coba lagi.", "bot");
  } finally {
    chatSend.disabled = false;
    chatInput.focus();
  }
};

loadProducts();
