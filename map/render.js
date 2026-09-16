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
  // perpendicular offset proportional to distance, gives a gentle great-circle-like arc
  const offset = dist * 0.18;
  const nx = -dy / (dist || 1);
  const ny = dx / (dist || 1);
  const cx = mx + nx * offset;
  const cy = my + ny * offset;
  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
}

async function main() {
  const width = parseInt(qs("width", "1080"), 10);
  const height = parseInt(qs("height", "1350"), 10);
  // progress: 0..1 fraction of flow lines "drawn in" (for future animation frames).
  // Defaults to 1 (fully drawn) for the static prototype.
  const progress = parseFloat(qs("progress", "1"));

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

  app.innerHTML = `
    <div class="eyebrow">DATA VISUALIZATION</div>
    <div class="title">Rice Aid Distribution Network — West Java</div>
    <div class="subtitle">38 Bulog warehouses distributing to 22 regencies and cities across West Java.</div>
    <div class="stat-row">
      <div class="stat-row-item">
        <div class="stat-row-value">${points.origins.length}</div>
        <div class="stat-row-label">Warehouses</div>
      </div>
      <div class="stat-row-item">
        <div class="stat-row-value">${points.destinations.length}</div>
        <div class="stat-row-label">Regencies/Cities</div>
      </div>
      <div class="stat-row-item">
        <div class="stat-row-value">${Math.round(d3.sum(points.destinations, d => d.allocationTons)).toLocaleString("en-US")}</div>
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

  const originById = Object.fromEntries(points.origins.map(o => [o.id, o]));
  const destByName = Object.fromEntries(points.destinations.map(d => [d.name, d]));
  const links = points.edges.map(e => ({
    source: originById[e.originId],
    target: destByName[e.destination],
    tons: e.tons,
  }));

  const widthScale = d3.scaleSqrt()
    .domain(d3.extent(links, (d) => d.tons))
    .range([0.75, 7]);
  const opacityScale = d3.scaleSqrt()
    .domain(d3.extent(links, (d) => d.tons))
    .range([0.28, 0.75]);

  const linksGroup = svg.append("g").attr("class", "flow-lines");
  linksGroup.selectAll("path")
    .data(links)
    .join("path")
    .attr("class", "flow-line")
    .attr("stroke-width", (d) => widthScale(d.tons))
    .attr("stroke-opacity", (d) => opacityScale(d.tons))
    .attr("d", (d) => {
      const [x1, y1] = project(d.source);
      const [x2, y2] = project(d.target);
      return curvedPath(x1, y1, x2, y2);
    });

  // Reveal flow lines up to `progress` (0..1) using stroke-dash trick,
  // ready for animation frames later; static prototype uses progress=1.
  linksGroup.selectAll("path").each(function () {
    const len = this.getTotalLength();
    d3.select(this)
      .attr("stroke-dasharray", `${len} ${len}`)
      .attr("stroke-dashoffset", len * (1 - progress));
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

  svg.append("g").attr("class", "destinations")
    .selectAll("circle")
    .data(destinationsSorted)
    .join("circle")
    .attr("class", "destination-dot")
    .attr("r", (d) => radiusScale(d.allocationTons))
    .attr("cx", (d) => project(d)[0])
    .attr("cy", (d) => project(d)[1]);

  document.body.setAttribute("data-ready", "true");
}

main();
