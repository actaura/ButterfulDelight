async function loadJSON(path) {
  const res = await fetch(path);
  return res.json();
}

function qs(name, fallback) {
  const params = new URLSearchParams(window.location.search);
  return params.has(name) ? params.get(name) : fallback;
}

function curvedPath(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const offset = dist * 0.18;
  const nx = -dy / (dist || 1);
  const ny = dx / (dist || 1);
  const cx = mx + nx * offset;
  const cy = my + ny * offset;
  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
}

// Loop timeline (ms). Keep in sync with scripts/generate-map-animation.js.
const DURATION = 8000;
const FADE_IN_END = 400;
const FADE_OUT_START = 7600;
const FLOW_START = 1000;
const FLOW_END = 6000;
const EDGE_DRAW_DURATION = 700;
const GLOW_DURATION = 550;
const KPI_DURATION = 1500;
const GLOW_POOL_SIZE = 16;

function globalOpacity(t) {
  if (t < FADE_IN_END) return t / FADE_IN_END;
  if (t > FADE_OUT_START) return Math.max(0, 1 - (t - FADE_OUT_START) / (DURATION - FADE_OUT_START));
  return 1;
}

function easeOutCubic(p) {
  return 1 - Math.pow(1 - p, 3);
}

let state = null;

function renderFrame(t) {
  if (!state) return;
  const { container, links, destGroups, kpis, totals, glowPool } = state;

  container.style.opacity = globalOpacity(t).toFixed(3);

  const kp = easeOutCubic(Math.min(1, Math.max(0, t) / KPI_DURATION));
  kpis.warehouses.textContent = Math.round(kp * totals.warehouses);
  kpis.destinations.textContent = Math.round(kp * totals.destinations);
  kpis.tons.textContent = Math.round(kp * totals.tons).toLocaleString("en-US");

  const destBump = new Map();
  const activeGlows = [];

  links.forEach((link) => {
    let frac;
    if (t <= link.start) frac = 0;
    else if (t >= link.end) frac = 1;
    else frac = (t - link.start) / (link.end - link.start);
    link.path.setAttribute("stroke-dashoffset", (link.length * (1 - frac)).toFixed(2));

    if (t >= link.end && t <= link.end + GLOW_DURATION) {
      const gp = (t - link.end) / GLOW_DURATION;
      const bump = 0.28 * Math.sin(gp * Math.PI);
      const prevBump = destBump.get(link.destName) || 0;
      if (bump > prevBump) destBump.set(link.destName, bump);
      activeGlows.push({ x: link.tx, y: link.ty, r: link.baseR, gp });
    }
  });

  destGroups.forEach((g) => {
    const bump = destBump.get(g.name) || 0;
    g.el.setAttribute("transform", `translate(${g.x},${g.y}) scale(${(1 + bump).toFixed(3)})`);
  });

  glowPool.forEach((el, i) => {
    const glow = activeGlows[i];
    if (!glow) {
      el.setAttribute("opacity", "0");
      return;
    }
    const scale = 1 + 0.9 * glow.gp;
    el.setAttribute("cx", glow.x);
    el.setAttribute("cy", glow.y);
    el.setAttribute("r", (glow.r * scale).toFixed(2));
    el.setAttribute("opacity", (0.5 * (1 - glow.gp)).toFixed(3));
  });
}
window.renderFrame = renderFrame;
window.ANIMATION_DURATION_MS = DURATION;

async function main() {
  const width = parseInt(qs("width", "1080"), 10);
  const height = parseInt(qs("height", "1350"), 10);

  document.documentElement.style.width = width + "px";
  document.documentElement.style.height = height + "px";
  document.body.style.width = width + "px";
  document.body.style.height = height + "px";

  const app = document.getElementById("app");
  app.style.width = width + "px";
  app.style.height = height + "px";

  const [boundary, points] = await Promise.all([
    loadJSON("data/jawa-barat-boundary.json"),
    loadJSON("data/points.json"),
  ]);

  const totalTons = d3.sum(points.destinations, (d) => d.allocationTons);

  app.innerHTML = `
    <div class="eyebrow">DATA VISUALIZATION</div>
    <div class="title">Rice Aid Distribution Network — West Java</div>
    <div class="subtitle">38 Bulog warehouses distributing to 22 regencies and cities across West Java.</div>
    <div class="stat-row">
      <div class="stat-row-item">
        <div class="stat-row-value" id="kpi-warehouses">0</div>
        <div class="stat-row-label">Warehouses</div>
      </div>
      <div class="stat-row-item">
        <div class="stat-row-value" id="kpi-destinations">0</div>
        <div class="stat-row-label">Regencies/Cities</div>
      </div>
      <div class="stat-row-item">
        <div class="stat-row-value" id="kpi-tons">0</div>
        <div class="stat-row-label">Tons Allocated</div>
      </div>
    </div>
    <div class="map-area">
      <svg></svg>
      <div class="legend">
        <div class="legend-row">
          <svg class="legend-swatch" width="14" height="14"><circle cx="7" cy="7" r="4" class="origin-dot"></circle></svg>
          <span>Bulog warehouse (regency-level position)</span>
        </div>
        <div class="legend-row">
          <svg class="legend-swatch" width="18" height="18"><circle cx="9" cy="9" r="7" class="destination-dot"></circle></svg>
          <span>Regency/city — circle size = allocation volume</span>
        </div>
      </div>
    </div>
    <div class="footer-name">Achmad Taufiq Raihan</div>
  `;

  const mapArea = app.querySelector(".map-area");
  const mapWidth = width - 80;
  const mapHeight = mapArea.getBoundingClientRect().height;

  const svg = d3.select(mapArea).select("svg")
    .attr("width", mapWidth)
    .attr("height", mapHeight)
    .attr("viewBox", `0 0 ${mapWidth} ${mapHeight}`);

  const projection = d3.geoMercator().fitExtent(
    [[16, 16], [mapWidth - 16, mapHeight - 16]],
    boundary
  );
  const geoPath = d3.geoPath(projection);

  svg.append("path")
    .datum(boundary.features[0])
    .attr("class", "province-shape")
    .attr("d", geoPath);

  const project = (d) => projection([d.lng, d.lat]);

  const originById = Object.fromEntries(points.origins.map((o) => [o.id, o]));
  const destByName = Object.fromEntries(points.destinations.map((d) => [d.name, d]));

  const rawLinks = points.edges.map((e) => ({
    ...e,
    source: originById[e.originId],
    target: destByName[e.destination],
  }));

  // Highest-tonnage edges animate first; stagger fits within [FLOW_START, FLOW_END].
  const sortedLinks = [...rawLinks].sort((a, b) => b.tons - a.tons);
  const span = FLOW_END - EDGE_DRAW_DURATION - FLOW_START;
  const stagger = sortedLinks.length > 1 ? span / (sortedLinks.length - 1) : 0;
  sortedLinks.forEach((link, i) => {
    link.start = FLOW_START + i * stagger;
    link.end = link.start + EDGE_DRAW_DURATION;
  });

  const widthScale = d3.scaleSqrt()
    .domain(d3.extent(sortedLinks, (d) => d.tons))
    .range([0.75, 7]);
  const opacityScale = d3.scaleSqrt()
    .domain(d3.extent(sortedLinks, (d) => d.tons))
    .range([0.28, 0.75]);

  const linksGroup = svg.append("g").attr("class", "flow-lines");
  const links = sortedLinks.map((link) => {
    const [x1, y1] = project(link.source);
    const [x2, y2] = project(link.target);
    const pathEl = linksGroup.append("path")
      .attr("class", "flow-line")
      .attr("stroke-width", widthScale(link.tons))
      .attr("stroke-opacity", opacityScale(link.tons))
      .attr("d", curvedPath(x1, y1, x2, y2))
      .node();
    const length = pathEl.getTotalLength();
    pathEl.setAttribute("stroke-dasharray", `${length} ${length}`);
    pathEl.setAttribute("stroke-dashoffset", length);
    return {
      ...link,
      path: pathEl,
      length,
      tx: x2,
      ty: y2,
    };
  });

  svg.append("g").attr("class", "origins")
    .selectAll("circle")
    .data(points.origins)
    .join("circle")
    .attr("class", "origin-dot")
    .attr("r", 3.5)
    .attr("cx", (d) => project(d)[0])
    .attr("cy", (d) => project(d)[1]);

  const radiusScale = d3.scaleSqrt()
    .domain(d3.extent(points.destinations, (d) => d.allocationTons))
    .range([7, 26]);

  const destinationsSorted = [...points.destinations].sort((a, b) => b.allocationTons - a.allocationTons);

  const destGroupSel = svg.append("g").attr("class", "destinations")
    .selectAll("g")
    .data(destinationsSorted)
    .join("g")
    .attr("class", "dest-group");

  destGroupSel.append("circle")
    .attr("class", "destination-dot")
    .attr("r", (d) => radiusScale(d.allocationTons))
    .attr("cx", 0)
    .attr("cy", 0);

  const destGroups = [];
  destGroupSel.each(function (d) {
    const [x, y] = project(d);
    d3.select(this).attr("transform", `translate(${x},${y}) scale(1)`);
    destGroups.push({ el: this, name: d.name, x, y, r: radiusScale(d.allocationTons) });
  });

  const linkByDest = new Map();
  links.forEach((link) => {
    const r = radiusScale(link.target.allocationTons);
    link.baseR = r;
    link.destName = link.destination;
  });

  const glowLayer = svg.append("g").attr("class", "glow-layer");
  const glowPool = d3.range(GLOW_POOL_SIZE).map(() =>
    glowLayer.append("circle").attr("class", "glow-ring").attr("opacity", 0).node()
  );

  state = {
    container: app,
    links,
    destGroups,
    glowPool,
    totals: {
      warehouses: points.origins.length,
      destinations: points.destinations.length,
      tons: totalTons,
    },
    kpis: {
      warehouses: document.getElementById("kpi-warehouses"),
      destinations: document.getElementById("kpi-destinations"),
      tons: document.getElementById("kpi-tons"),
    },
  };

  renderFrame(parseFloat(qs("t", "0")));
  document.body.setAttribute("data-ready", "true");
}

main();
