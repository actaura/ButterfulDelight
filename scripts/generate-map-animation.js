const path = require("path");
const os = require("os");
const http = require("http");
const fs = require("fs");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "output");
const FRAMES_DIR = path.join(os.tmpdir(), "map-anim-frames");

const FPS = 30;

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

async function main() {
  const width = 1080;
  const height = 1350;

  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const server = await startServer();
  const port = server.address().port;

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });

  const url = `http://127.0.0.1:${port}/map/template-anim.html?width=${width}&height=${height}&t=0`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector('body[data-ready="true"]');

  const duration = await page.evaluate(() => window.ANIMATION_DURATION_MS);
  const frameCount = Math.round((duration / 1000) * FPS);
  console.log(`Rendering ${frameCount} frames at ${FPS}fps (${duration}ms loop)...`);

  for (let i = 0; i < frameCount; i++) {
    const t = i * (1000 / FPS);
    await page.evaluate((tt) => {
      window.renderFrame(tt);
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, t);
    const framePath = path.join(FRAMES_DIR, `frame_${String(i).padStart(4, "0")}.png`);
    await page.screenshot({ path: framePath });
    if (i % 30 === 0) console.log(`  frame ${i}/${frameCount} (t=${t.toFixed(0)}ms)`);
  }

  await browser.close();
  server.close();

  console.log("Encoding MP4 with ffmpeg...");
  const mp4Path = path.join(OUTPUT_DIR, "map-animation.mp4");
  execFileSync("ffmpeg", [
    "-y",
    "-framerate", String(FPS),
    "-i", path.join(FRAMES_DIR, "frame_%04d.png"),
    "-vf", "format=yuv420p",
    "-c:v", "libx264",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    mp4Path,
  ], { stdio: "inherit" });
  console.log(`Saved ${mp4Path}`);

  console.log(`Frame sequence kept at ${FRAMES_DIR} for GIF export.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
