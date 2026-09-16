async function loadData() {
  const res = await fetch("/data/slides.json");
  return res.json();
}

function renderCover(slide, meta) {
  return `
    <div class="cover-kicker">${slide.kicker}</div>
    <div class="cover-title">${slide.title}</div>
    <div class="cover-subtitle">${slide.subtitle}</div>
    <div class="cover-accent-line"></div>
    <div class="cover-watermark">${slide.watermark || ""}</div>
    <div style="margin-top:auto; position:relative; z-index:1;">
      <div class="cover-rule"></div>
      <div class="cover-author-block">
        <div class="cover-author-name">${slide.author}</div>
        <div class="cover-author-role">${slide.authorRole}</div>
      </div>
      <div class="cover-swipe">
        <span>${slide.swipeLabel}</span>
      </div>
    </div>
  `;
}

function renderContext(slide) {
  const cards = slide.stats.map(s => `
    <div class="stat-card">
      <div class="stat-value">${s.value}</div>
      <div class="stat-label">${s.label}</div>
    </div>
  `).join("");
  return `
    <div class="eyebrow">${slide.eyebrow}</div>
    <div class="title">${slide.title}</div>
    <div class="description">${slide.description}</div>
    <div class="stat-grid">${cards}</div>
  `;
}

function renderInsight(slide) {
  return `
    <div class="eyebrow">${slide.eyebrow}</div>
    <div class="title">${slide.title}</div>
    <div class="description">${slide.description}</div>
    <div class="insight-highlight">
      <div class="insight-highlight-text">${slide.highlight}</div>
    </div>
  `;
}

function renderMethodology(slide) {
  const steps = slide.steps.map(s => `
    <div class="step-card">
      <div class="step-number">${s.number}</div>
      <div>
        <div class="step-title">${s.title}</div>
        <div class="step-description">${s.description}</div>
        <div class="step-tag">${s.tag}</div>
      </div>
    </div>
  `).join("");
  return `
    <div class="eyebrow">${slide.eyebrow}</div>
    <div class="title">${slide.title}</div>
    <div class="step-list">${steps}</div>
  `;
}

function renderBigNumber(slide) {
  return `
    <div class="eyebrow">${slide.eyebrow}</div>
    <div class="title">${slide.title}</div>
    <div class="bignumber-wrap">
      <div class="bignumber-row">
        <div class="bignumber-label">${slide.before.label}</div>
        <div class="bignumber-value">${slide.before.value}</div>
      </div>
      <div class="bignumber-arrow">&#8595;</div>
      <div class="bignumber-row bignumber-row--after">
        <div class="bignumber-label">${slide.after.label}</div>
        <div class="bignumber-value">${slide.after.value}</div>
      </div>
      <div class="delta-badge">
        <div class="delta-value">${slide.delta}</div>
        <div class="delta-label">${slide.deltaLabel}</div>
      </div>
    </div>
  `;
}

function renderMetrics(slide) {
  const rows = slide.metrics.map(m => `
    <div class="metric-card">
      <div class="metric-name">${m.label}</div>
      <div class="metric-compare">
        <div class="metric-figure metric-figure--before">
          <div class="metric-figure-label">Before</div>
          <div class="metric-figure-value">${m.before}</div>
        </div>
        <div class="metric-sep">&#8594;</div>
        <div class="metric-figure metric-figure--after">
          <div class="metric-figure-label">After</div>
          <div class="metric-figure-value">${m.after}</div>
        </div>
      </div>
    </div>
  `).join("");
  return `
    <div class="eyebrow">${slide.eyebrow}</div>
    <div class="title">${slide.title}</div>
    <div class="metric-list">${rows}</div>
  `;
}

function renderTools(slide) {
  const rows = slide.items.map(t => `
    <div class="tool-row">
      <div class="tool-dot"></div>
      <div>
        <div class="tool-name">${t.name}</div>
        <div class="tool-detail">${t.detail}</div>
      </div>
    </div>
  `).join("");
  return `
    <div class="eyebrow">${slide.eyebrow}</div>
    <div class="title">${slide.title}</div>
    <div class="tool-list">${rows}</div>
  `;
}

function renderClosing(slide) {
  return `
    <div class="eyebrow">${slide.eyebrow}</div>
    <div class="title">${slide.title}</div>
    <div class="description closing-description">${slide.description}</div>
    <div class="closing-contact">
      <div class="closing-contact-label">${slide.contactLabel}</div>
      <div class="closing-contact-name">${slide.contactName}</div>
      <div class="closing-contact-handle">${slide.contactHandle}</div>
    </div>
  `;
}

const RENDERERS = {
  cover: renderCover,
  context: renderContext,
  insight: renderInsight,
  methodology: renderMethodology,
  bignumber: renderBigNumber,
  metrics: renderMetrics,
  tools: renderTools,
  closing: renderClosing,
};

async function main() {
  const params = new URLSearchParams(window.location.search);
  const slideId = parseInt(params.get("slide") || "1", 10);
  const data = await loadData();
  const slide = data.slides.find(s => s.id === slideId);
  if (!slide) {
    document.getElementById("app").innerHTML = `<p>Slide ${slideId} not found</p>`;
    return;
  }
  const renderer = RENDERERS[slide.layout];
  const body = renderer ? renderer(slide, data.meta) : `<p>Unknown layout: ${slide.layout}</p>`;
  // Cover already shows the name prominently in its own author block, so the
  // small footer name is skipped there to avoid showing it twice.
  const isCover = slide.layout === "cover";
  // Layouts whose content leaves a large empty area get a faint ring accent
  // so they don't read as unfinished. Cover has its own watermark, and
  // bignumber is intentionally left bare so the -33% figure stays the sole
  // focal point.
  const RING_LAYOUTS = new Set(["context", "insight", "methodology", "metrics", "tools", "closing"]);
  const ring = RING_LAYOUTS.has(slide.layout) ? `<div class="bg-ring"></div>` : "";
  const slideNumber = `<div class="slide-number">${String(slide.id).padStart(2, "0")} / ${String(data.meta.totalSlides).padStart(2, "0")}</div>`;
  const footerName = `<div class="slide-footer">${data.meta.footerName}</div>`;
  document.getElementById("app").innerHTML = `
    <div class="slide slide--${slide.layout}">
      ${slideNumber}
      ${isCover ? "" : footerName}
      ${ring}
      <div class="slide-content">${body}</div>
    </div>
  `;
  document.body.setAttribute("data-ready", "true");
}

main();
