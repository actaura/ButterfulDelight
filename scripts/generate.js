const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "output");
const DATA_PATH = path.join(ROOT, "data", "slides.json");

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

function slugify(layout, id) {
  return `slide-${String(id).padStart(2, "0")}-${layout}.png`;
}

async function main() {
  const onlyId = process.argv[2] ? parseInt(process.argv[2], 10) : null;
  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
  const slidesToRender = onlyId
    ? data.slides.filter((s) => s.id === onlyId)
    : data.slides;

  if (slidesToRender.length === 0) {
    console.error(`Slide ${onlyId} not found in data/slides.json`);
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const server = await startServer();
  const port = server.address().port;

  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
  });
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1350 },
    deviceScaleFactor: 2,
  });

  for (const slide of slidesToRender) {
    const url = `http://127.0.0.1:${port}/slides/template.html?slide=${slide.id}`;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector('body[data-ready="true"]');
    const outPath = path.join(OUTPUT_DIR, slugify(slide.layout, slide.id));
    await page.screenshot({ path: outPath });
    console.log(`Saved ${outPath}`);
  }

  await browser.close();
  server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
