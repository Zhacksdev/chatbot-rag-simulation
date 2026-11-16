const test = require("node:test");
const assert = require("node:assert");

const { categoryOf, detectColumns, csvEscape } = require("../scripts/import-csv");

test("kategori diambil dari nama produk", () => {
  assert.strictEqual(categoryOf("BRODO - Sneakers Ace Neptune Charcoal"), "Sneakers");
  assert.strictEqual(categoryOf("BRODO - Dompet Folde Black"), "Dompet");
  assert.strictEqual(categoryOf("BRODO - Biak Parfum Eau de Toilette"), "Parfum");
  assert.strictEqual(categoryOf("BRODO - Broslides Zulu Black"), "Sandal");
});

test("pakaian menang atas sepatu olahraga untuk polo dan jersey", () => {
  // "Tennis Padel" muncul di nama kaos polo; urutan aturan harus menjaga ini.
  assert.strictEqual(categoryOf("BRODO - Tecnico Tennis Padel Polo White - Green"), "Pakaian");
  assert.strictEqual(categoryOf("BRODO - Brodo Racquet Club Jersey White"), "Pakaian");
  assert.strictEqual(categoryOf("BRODO - Active Stance Tennis Padel White Crystal"), "Sepatu Olahraga");
});

test("kaos kaki tidak tertukar dengan kaos", () => {
  assert.strictEqual(categoryOf("BRODO - Kaos Kaki Logo Pack"), "Kaos Kaki");
  assert.strictEqual(categoryOf("BRODO - Broshirt Logo Black"), "Pakaian");
});

test("produk tak dikenal masuk Lainnya", () => {
  assert.strictEqual(categoryOf("BRODO - Benda Misterius"), "Lainnya");
});

test("kolom dikenali dari isinya, bukan dari nama kolom", () => {
  const header = ["contents href", "_image_yazkc_11 src", "whitespace-normal", "font-medium 2", "h-4", "inline-block"];
  const rows = [
    ["https://shopee.co.id/a", "https://down-id.img.susercontent.com/1", "BRODO - Sneakers Ace Neptune Charcoal Silver", "616.550", "-10%", "4.9"],
    ["https://shopee.co.id/b", "https://down-id.img.susercontent.com/2", "BRODO - Sneakers Ace Nova Grey OWS", "503.200", "-24%", "5.0"],
    ["https://shopee.co.id/c", "https://down-id.img.susercontent.com/3", "BRODO - Dompet Folde Black Leather", "249.000", "-15%", "4.8"]
  ];

  const roles = detectColumns(header, rows);
  assert.strictEqual(roles.link, 0);
  assert.strictEqual(roles.gambar, 1);
  assert.strictEqual(roles.nama, 2);
  assert.strictEqual(roles.harga, 3);
  assert.strictEqual(roles.rating, 5);
  // Kolom diskon (-10%) tidak boleh dipakai jadi apa pun.
  assert.ok(!Object.values(roles).includes(4));
});

test("harga tidak tertukar dengan rating", () => {
  const roles = detectColumns(["a", "b"], [["4.9", "616.550"], ["5.0", "503.200"]]);
  assert.strictEqual(roles.rating, 0);
  assert.strictEqual(roles.harga, 1);
});

test("csvEscape melindungi koma, kutip, dan baris baru", () => {
  assert.strictEqual(csvEscape("biasa"), "biasa");
  assert.strictEqual(csvEscape("Boots, Kulit"), '"Boots, Kulit"');
  assert.strictEqual(csvEscape('kata "kunci"'), '"kata ""kunci"""');
  assert.strictEqual(csvEscape(""), "");
});
