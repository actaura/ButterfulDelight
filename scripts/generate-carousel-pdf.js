const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");

// Usage: node scripts/generate-carousel-pdf.js <imageDir> <outPdfPath>
async function main() {
  const imageDir = path.resolve(process.argv[2] || path.join(ROOT, "output"));
  const outPath = path.resolve(process.argv[3] || path.join(ROOT, "output", "bansos-distribution-carousel-final.pdf"));

  const files = fs.readdirSync(imageDir)
    .filter((f) => /^slide-\d{2}-.*\.png$/.test(f))
    .sort();

  if (files.length === 0) {
    throw new Error(`No slide-NN-*.png files found in ${imageDir}`);
  }
  console.log(`Combining ${files.length} slides into PDF:`, files);

  const pagesHtml = files.map((f) => {
    const filePath = path.join(imageDir, f);
    const dataUri = `data:image/png;base64,${fs.readFileSync(filePath).toString("base64")}`;
    return `<div class="page"><img src="${dataUri}" /></div>`;
  }).join("\n");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page { size: 1080px 1350px; margin: 0; }
  * { margin: 0; padding: 0; }
  .page { width: 1080px; height: 1350px; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  .page img { width: 1080px; height: 1350px; display: block; }
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`;

  const tmpHtmlPath = path.join(require("os").tmpdir(), "carousel-pdf-source.html");
  fs.writeFileSync(tmpHtmlPath, html);

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage();
  await page.goto(`file://${tmpHtmlPath}`, { waitUntil: "load" });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await page.pdf({
    path: outPath,
    printBackground: true,
    preferCSSPageSize: true,
  });
  await browser.close();

  console.log(`Saved ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
