const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "output");

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
};

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    const filePath = path.join(ROOT, urlPath);
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(content);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

// Usage: node scripts/generate-map-frame.js <t_ms> <outName> [width] [height]
async function main() {
  const t = process.argv[2] ? parseInt(process.argv[2], 10) : 0;
  const outName = process.argv[3] || `map-frame-${t}.png`;
  const width = process.argv[4] ? parseInt(process.argv[4], 10) : 1080;
  const height = process.argv[5] ? parseInt(process.argv[5], 10) : 1350;

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const server = await startServer();
  const port = server.address().port;

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 2,
  });

  const url = `http://127.0.0.1:${port}/map/template-anim.html?width=${width}&height=${height}&t=${t}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector('body[data-ready="true"]');
  const outPath = path.join(OUTPUT_DIR, outName);
  await page.screenshot({ path: outPath });
  console.log(`Saved ${outPath}`);

  await browser.close();
  server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
