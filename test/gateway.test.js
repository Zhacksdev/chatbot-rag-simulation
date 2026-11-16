const test = require("node:test");
const assert = require("node:assert");

const { isGroupOrBroadcast } = require("../wa-gateway");

test("chat pribadi dibalas, baik @c.us maupun @lid", () => {
  assert.strictEqual(isGroupOrBroadcast("6281234567890@c.us"), false);
  // WhatsApp memakai @lid untuk sebagian chat pribadi. Dulu nomor seperti ini
  // tersaring habis dan bot diam tanpa log apa pun.
  assert.strictEqual(isGroupOrBroadcast("123456789012345@lid"), false);
});

test("grup, status, broadcast, dan channel diabaikan", () => {
  assert.strictEqual(isGroupOrBroadcast("6281234567890-1600000000@g.us"), true);
  assert.strictEqual(isGroupOrBroadcast("status@broadcast"), true);
  assert.strictEqual(isGroupOrBroadcast("120363000000000000@newsletter"), true);
});

test("nilai kosong tidak membuat crash", () => {
  assert.strictEqual(isGroupOrBroadcast(""), false);
  assert.strictEqual(isGroupOrBroadcast(undefined), false);
  assert.strictEqual(isGroupOrBroadcast(null), false);
});
