// Server lokal untuk menguji website sebelum deploy ke Vercel.
// Di Vercel file ini tidak dipakai: folder public/ disajikan otomatis dan
// setiap file di api/ menjadi serverless function.
require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon"
};

// Tiru API res.status().json() milik Vercel supaya handler di api/ tidak
// perlu tahu dijalankan di mana.
function wrapResponse(res) {
  res.status = code => {
    res.statusCode = code;
    return res;
  };
  res.json = payload => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
  };
  return res;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 100_000) reject(new Error("Body terlalu besar"));
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function serveStatic(res, urlPath) {
  const relative = urlPath === "/" ? "index.html" : decodeURIComponent(urlPath).replace(/^\/+/, "");
  const filePath = path.join(PUBLIC_DIR, relative);

  // Cegah path traversal (../../.env) dari URL.
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    res.setHeader("Content-Type", MIME[path.extname(filePath)] || "application/octet-stream");
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const urlPath = (req.url || "/").split("?")[0];

  if (urlPath.startsWith("/api/")) {
    const name = urlPath.slice("/api/".length).replace(/[^a-z0-9_-]/gi, "");
    const handlerPath = path.join(__dirname, "api", `${name}.js`);

    if (!fs.existsSync(handlerPath)) {
      wrapResponse(res).status(404).json({ error: "Endpoint tidak ada." });
      return;
    }

    try {
      const raw = req.method === "POST" ? await readBody(req) : "";
      req.body = raw ? JSON.parse(raw) : {};
      await require(handlerPath)(req, wrapResponse(res));
    } catch (err) {
      console.error(`[dev-server ${urlPath}]`, err.message);
      wrapResponse(res).status(500).json({ error: "Kesalahan server lokal." });
    }
    return;
  }

  serveStatic(res, urlPath);
});

server.listen(PORT, () => {
  console.log(`Website berjalan di http://localhost:${PORT}`);
});
