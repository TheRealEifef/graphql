// profile.js

let xpDataGlobal = [];
let cumulativeXP = 0;
let totalProject = 0;
let totalExercise = 0;

async function loadProfile() {
  const [userRes, auditRes] = await Promise.all([
    fetchGraphQL(`{ user { id login email firstName lastName } }`),
    fetchGraphQL(`{ user { auditRatio totalUp totalDown } }`)
  ]);

  const user = userRes.user[0];
  const auditUser = auditRes.user[0];

  document.getElementById("fullName").textContent = `Welcome, ${user.firstName} ${user.lastName}!`;
  document.getElementById("username").textContent = `#${user.login}`;



  drawDoneRecievedChart(auditUser.totalUp, auditUser.totalDown, auditUser.auditRatio);
  await drawXpTable();
  drawXpProgression();
}

function formatXp(amount) {
  if (amount < 1000) {
    return `${Math.ceil(amount)} B`;
  }
  const kb = amount / 1000;
  return kb >= 100 ? `${Math.ceil(kb)} kB` : `${Math.ceil(kb)} kB`;
}

function formatRatio(amount) {
  if (amount < 1000) {
    return `${(Math.round(amount)/1000).toFixed(2)} MB`;
  }
  const x = amount / 1000;
  return `${(Math.round(x)/1000).toFixed(2)} MB`;
}

async function drawXpTable() {
  const oldestResult = await fetchGraphQL(`{
    transaction(
      where: {
        _and: [
          { type: { _eq: "xp" } },
          { path: { _like: "/bahrain/bh-module/%" } },
          { path: { _nlike: "/bahrain/bh-module/checkpoint/%" } }
        ]
      },
      order_by: { createdAt: asc },
      limit: 1
    ) {
      createdAt
    }
  }`);
  const oldestDate = oldestResult.transaction[0]?.createdAt;
  console.log("Oldest Project Date:", oldestDate);

  const xpTableResult = await fetchGraphQL(`{
    transaction(
      where: { 
        _and: [
          { type: { _eq: "xp" } },
          { path: { _like: "/bahrain/bh-module/%" } },
          { path: { _nlike: "/bahrain/bh-module/checkpoint/%" } },
          { path: { _nlike: "/bahrain/bh-module/piscine-js/%" } }
        ]
      }
    ) {
      amount
      createdAt
      object { name type }
    }
  }`);

  const normalProjects = xpTableResult.transaction.map(tx => ({
    amount: tx.amount,
    createdAt: new Date(tx.createdAt),
    date: new Date(tx.createdAt).toLocaleDateString(),
    project: tx.object?.name || "Unnamed",
    type: tx.object?.type || "Untyped"
  }));
  console.log("Normal Projects:", normalProjects);

  let checkpointProjects = [];
  if (oldestDate) {
    const checkpointResult = await fetchGraphQL(`{
      transaction(
        where: {
          _and: [
            { type: { _eq: "xp" } },
            { path: { _like: "/bahrain/bh-module/checkpoint/%" } },
            { createdAt: { _gt: "${oldestDate}" } }
          ]
        }
      ) {
        amount
        createdAt
        object { name type }
      }
    }`);

    checkpointProjects = checkpointResult.transaction.map(tx => ({
      amount: tx.amount,
      createdAt: new Date(tx.createdAt),
      date: new Date(tx.createdAt).toLocaleDateString(),
      project: tx.object?.name || "Unnamed",
      type: tx.object?.type || "Untyped"
    }));
  }

  const mergedData = [...normalProjects, ...checkpointProjects]
    .sort((a, b) => b.createdAt - a.createdAt);
  console.log("Merged XP Data:", mergedData);

  xpDataGlobal = mergedData;

  const data = mergedData;
  const tbody = document.querySelector("#xpTable tbody");
  tbody.innerHTML = "";
  data.forEach(item => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td style="padding:8px">${item.project}</td>
      <td style="padding:8px">${formatXp(item.amount)}</td>
      <td style="padding:8px">${item.date}</td>
    `;
    tbody.appendChild(row);
  });

  drawXpBarChart(data);
}

// helper to read CSS vars with fallback
function getCssVar(varName, fallback) {
	// ensure computed styles are available
	try {
		const val = getComputedStyle(document.documentElement).getPropertyValue(varName);
		if (val && val.trim()) return val.trim();
	} catch (e) {}
	return fallback;
}

function drawXpBarChart(entries) {
  const svg = document.getElementById("xpBarChart");
  if (!svg) return;

  const legend = document.getElementById("xpBarLegend");
  // use CSS palette for cohesive chart coloring
  const projectsColor = getCssVar("--primary", "#ff7a59"); // main bar color (coral)
  const fallbackColor = getCssVar("--accent", "#ffd166"); // secondary (sunny)
  const textColor = getCssVar("--text", "#10323a");       // main text (deep sea)
  const mutedText = getCssVar("--muted", "#6aa5a1");      // muted labels (sea-green)
  const gridColor = getCssVar("--muted-2", "rgba(16,50,58,0.06)");
  const axisColor = getCssVar("--muted", "#6aa5a1");

  if (legend) {
    legend.innerHTML = `
      <span class="legend-item"><span class="legend-swatch" style="background:${projectsColor}"></span>Project</span>
      <span class="legend-item"><span class="legend-swatch" style="background:${fallbackColor}"></span>Other</span>
    `;
  }

  svg.innerHTML = "";

  if (!entries || entries.length === 0) {
    return;
  }

  const aggregated = new Map();
  entries.forEach((entry) => {
    const key = entry.project;
    const type = (entry.type || "other").toLowerCase();
    if (!aggregated.has(key)) {
      aggregated.set(key, { project: key, total: 0, type });
    }
    const record = aggregated.get(key);
    record.total += entry.amount;
    if (type !== "untyped" && type !== "other") {
      record.type = type;
    }
  });

  const data = Array.from(aggregated.values());
  if (!data.length) {
    return;
  }

  const width = Math.max(600, data.length * 80);
  const height = 360;
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);

  const margin = { top: 20, right: 30, bottom: 120, left: 80 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(...data.map((d) => d.total), 1);
  const step = chartWidth / data.length;

  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const value = (maxValue / ticks) * i;
    const y = height - margin.bottom - (value / maxValue) * chartHeight;

    const gridLine = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line"
    );
    gridLine.setAttribute("x1", margin.left);
    gridLine.setAttribute("y1", y);
    gridLine.setAttribute("x2", width - margin.right);
    gridLine.setAttribute("y2", y);
    gridLine.setAttribute("stroke", gridColor);
    gridLine.setAttribute("stroke-dasharray", "4 2");
    svg.appendChild(gridLine);

    const label = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text"
    );
    label.setAttribute("x", margin.left - 12);
    label.setAttribute("y", y + 4);
    label.setAttribute("font-size", "12px");
    label.setAttribute("fill", mutedText);
    label.setAttribute("text-anchor", "end");
    label.textContent = formatXp(value);
    svg.appendChild(label);
  }

  const axisX = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "line"
  );
  axisX.setAttribute("x1", margin.left);
  axisX.setAttribute("y1", height - margin.bottom);
  axisX.setAttribute("x2", width - margin.right);
  axisX.setAttribute("y2", height - margin.bottom);
  axisX.setAttribute("stroke", axisColor);
  svg.appendChild(axisX);

  const axisY = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "line"
  );
  axisY.setAttribute("x1", margin.left);
  axisY.setAttribute("y1", margin.top);
  axisY.setAttribute("x2", margin.left);
  axisY.setAttribute("y2", height - margin.bottom);
  axisY.setAttribute("stroke", axisColor);
  svg.appendChild(axisY);

  data.forEach((item, index) => {
    const barHeight = (item.total / maxValue) * chartHeight;
    const barWidth = step * 0.7;
    const x = margin.left + index * step + (step - barWidth) / 2;
    const y = height - margin.bottom - barHeight;
    const color = projectsColor || fallbackColor;

    const rect = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect"
    );
    rect.setAttribute("x", x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", barWidth);
    rect.setAttribute("height", barHeight);
    rect.setAttribute("fill", color);
    svg.appendChild(rect);

    const tooltip = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "title"
    );
    tooltip.textContent = `${item.project}: ${formatXp(item.total)}`;
    rect.appendChild(tooltip);

    const valueText = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text"
    );
    valueText.setAttribute("x", x + barWidth / 2);
    valueText.setAttribute("y", y - 6);
    valueText.setAttribute("text-anchor", "middle");
    valueText.setAttribute("font-size", "12px");
    valueText.setAttribute("fill", textColor);
    valueText.textContent = formatXp(item.total);
    svg.appendChild(valueText);

    const label = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text"
    );
    const labelX = margin.left + index * step + step / 2;
    const labelY = height - margin.bottom + 50;
    label.setAttribute("x", labelX);
    label.setAttribute("y", labelY);
    label.setAttribute("font-size", "12px");
    label.setAttribute("fill", mutedText);
    label.setAttribute("text-anchor", "end");
    label.setAttribute(
      "transform",
      `rotate(-45 ${labelX} ${labelY})`
    );
    label.textContent = item.project;
    svg.appendChild(label);
  });
}

function drawDoneRecievedChart(gave, received, ratioT) {
  const svg = document.getElementById("graph3");
  svg.innerHTML = "";

  // Increased width from 340 to 460
  const width = 460;
  const height = 260;
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);

  // Adjusted margins for wider chart
  const margin = { top: 40, right: 100, bottom: 60, left: 80 };
  const chartWidth = width - margin.left - margin.right;
  const barHeight = 24;

  // defs / gradients (kept simple)
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const makeGrad = (id, a, b) => {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
    g.setAttribute("id", id);
    g.setAttribute("x1", "0%");
    g.setAttribute("x2", "100%");
    g.setAttribute("y1", "0%");
    g.setAttribute("y2", "0%");
    const s1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    s1.setAttribute("offset", "0%");
    s1.setAttribute("stop-color", a);
    const s2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    s2.setAttribute("offset", "100%");
    s2.setAttribute("stop-color", b);
    g.appendChild(s1);
    g.appendChild(s2);
    defs.appendChild(g);
  };
  // pick gradient stops from palette for good contrast
  const start = getCssVar("--primary", "#ff7a59");
  const end = getCssVar("--accent", "#ffd166");
  makeGrad("doneGrad", start, end);
  makeGrad("receivedGrad", start, end);
  svg.appendChild(defs);

  const total = Math.max(gave, received, 1);
  const bars = [
    { label: "Done", value: gave, gradient: "url(#doneGrad)" },
    { label: "Received", value: received, gradient: "url(#receivedGrad)" }
  ];

  const textColor = getCssVar("--text", "#10323a");
  const mutedText = getCssVar("--muted", "#6aa5a1");
  const trackFill = getCssVar("--muted-2", "rgba(16,50,58,0.06)");

  bars.forEach((bar, i) => {
    const y = margin.top + i * (barHeight + 20);

    // Background track
    const bgBar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bgBar.setAttribute("x", margin.left);
    bgBar.setAttribute("y", y);
    bgBar.setAttribute("width", chartWidth);
    bgBar.setAttribute("height", barHeight);
    bgBar.setAttribute("rx", barHeight / 2);
    bgBar.setAttribute("fill", trackFill);
    svg.appendChild(bgBar);

    // Value bar (ensure a small minimum width for visibility)
    const valueWidth = Math.max((bar.value / total) * chartWidth, bar.value > 0 ? 28 : 0);
    const valueBar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    valueBar.setAttribute("x", margin.left);
    valueBar.setAttribute("y", y);
    valueBar.setAttribute("width", valueWidth);
    valueBar.setAttribute("height", barHeight);
    valueBar.setAttribute("rx", barHeight / 2);
    valueBar.setAttribute("fill", bar.gradient);
    svg.appendChild(valueBar);

    // Left label
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", margin.left - 12);
    label.setAttribute("y", y + barHeight / 2);
    label.setAttribute("text-anchor", "end");
    label.setAttribute("dominant-baseline", "middle");
    label.setAttribute("fill", textColor);
    label.setAttribute("font-size", "14px");
    label.textContent = bar.label;
    svg.appendChild(label);

    // Determine where to place the value text so it doesn't overflow:
    const valueTextStr = formatRatio(bar.value);

    // Measure text width by temporarily adding hidden text to SVG
    const measure = document.createElementNS("http://www.w3.org/2000/svg", "text");
    measure.setAttribute("x", 0);
    measure.setAttribute("y", 0);
    measure.setAttribute("font-size", "14px");
    measure.setAttribute("visibility", "hidden");
    measure.textContent = valueTextStr;
    svg.appendChild(measure);
    let textWidth = 0;
    try {
      textWidth = measure.getBBox().width;
    } catch (e) {
      // fallback if getBBox fails
      textWidth = valueTextStr.length * 8;
    }
    svg.removeChild(measure);

    // If bar is wide enough, place the text centered inside the bar; otherwise place it to the right but clamped to available space
    if (valueWidth >= textWidth + 12) {
      const inside = document.createElementNS("http://www.w3.org/2000/svg", "text");
      inside.setAttribute("x", margin.left + valueWidth / 2);
      inside.setAttribute("y", y + barHeight / 2);
      inside.setAttribute("text-anchor", "middle");
      inside.setAttribute("dominant-baseline", "middle");
      inside.setAttribute("font-size", "14px");
      inside.setAttribute("fill", textColor);
      inside.textContent = valueTextStr;
      svg.appendChild(inside);
    } else {
      // place outside but ensure it does not overflow right margin
      const paddingRight = 8;
      let xPos = margin.left + valueWidth + 12;
      // clamp x so the text doesn't go past the right edge of the chart area
      const maxX = width - margin.right - textWidth;
      if (xPos > maxX) xPos = Math.max(margin.left + valueWidth + 6, maxX);
      const outside = document.createElementNS("http://www.w3.org/2000/svg", "text");
      outside.setAttribute("x", xPos);
      outside.setAttribute("y", y + barHeight / 2);
      outside.setAttribute("text-anchor", "start");
      outside.setAttribute("dominant-baseline", "middle");
      outside.setAttribute("font-size", "14px");
      outside.setAttribute("fill", textColor);
      outside.textContent = valueTextStr;
      svg.appendChild(outside);
    }
  });

  // Ratio display + message (bottom)
  const roundedRatio = (ratioT || 0).toFixed(1);
  const ratioDisplay = document.createElementNS("http://www.w3.org/2000/svg", "text");
  ratioDisplay.setAttribute("x", width / 2);
  ratioDisplay.setAttribute("y", height - margin.bottom + 10);
  ratioDisplay.setAttribute("text-anchor", "middle");
  ratioDisplay.setAttribute("fill", textColor);
  ratioDisplay.setAttribute("font-size", "32px");
  ratioDisplay.textContent = roundedRatio;
  svg.appendChild(ratioDisplay);

  const messageDisplay = document.createElementNS("http://www.w3.org/2000/svg", "text");
  messageDisplay.setAttribute("x", width / 2);
  messageDisplay.setAttribute("y", height - margin.bottom + 36);
  messageDisplay.setAttribute("text-anchor", "middle");
  messageDisplay.setAttribute("fill", '#103332');
  messageDisplay.setAttribute("font-size", "14px");
  let msg = "You can do better!";
  if (ratioT > 1.3) msg = "Great job!";
  else if (ratioT > 1.1) msg = "Looking good!";
  messageDisplay.textContent = msg;
  svg.appendChild(messageDisplay);
}

function drawXpProgression() {
  const data = xpDataGlobal
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(entry => {
      cumulativeXP += entry.amount;
      if (entry.type === "project" || entry.type === "piscine") totalProject++;
      else if (entry.type === "exercise") totalExercise++;
      return { date: entry.date, total: cumulativeXP, createdAt: entry.createdAt };
    });

  document.getElementById("totalProjects").textContent = totalProject;
  document.getElementById("totalExcercises").textContent = totalExercise;

  const totalXP = data.at(-1)?.total || 0;
  document.getElementById("totalXp").textContent = `${Math.round(totalXP / 1000)} KB`;

  const svg = document.getElementById("graph2");
  svg.innerHTML = "";

  const width = 800;
  const height = 300;
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);

  const padding = 60;

  const maxXP = Math.max(...data.map((d) => d.total));
  const xScale = (width - 2 * padding) / (data.length - 1);
  const yScale = (height - 2 * padding) / maxXP;

  // palette-aware colors
  const gridColor = getCssVar("--muted-2", "rgba(16,50,58,0.06)");
  const axisColor = getCssVar("--muted", "#6aa5a1");
  const labelColor = getCssVar("--muted", "#6aa5a1");
  const xLabelColor = getCssVar("--muted", "#6aa5a1");
  const smallTextColor = getCssVar("--text", "#10323a");

  // Gridlines & Labels
  for (let i = 0; i <= 5; i++) {
    const yVal = (maxXP / 5) * i;
    const y = height - padding - yVal * yScale;

    // Grid line
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", padding);
    line.setAttribute("y1", y);
    line.setAttribute("x2", width - padding);
    line.setAttribute("y2", y);
    line.setAttribute("stroke", gridColor);
    line.setAttribute("stroke-dasharray", "4 2");
    svg.appendChild(line);

    // Y axis label
    const label = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text"
    );
    label.setAttribute("x", padding-10);
    label.setAttribute("y", y + 5);
    label.setAttribute("text-anchor", "end");
    label.setAttribute("font-size", "12px");
    label.setAttribute("fill", labelColor);
    label.textContent = `${(yVal / 1000).toFixed(1)} kB`;
    svg.appendChild(label);
  }

  // X axis date labels
  const dateInterval = Math.ceil(data.length / 10);
  data.forEach((d, i) => {
    if (i % dateInterval !== 0) return;
    const x = padding + i * xScale;
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", x);
    text.setAttribute("y", height - padding + 25);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-size", "12px");
    text.setAttribute("fill", xLabelColor);
    text.textContent = d.date;
    svg.appendChild(text);
  });

  // Line path (smooth curve)
  let pathD = "";
  for (let i = 0; i < data.length; i++) {
    const x = padding + i * xScale;
    const y = height - padding - data[i].total * yScale;
    if (i === 0) {
      //M = moveto (move from one point to another point)
      pathD += `M ${x},${y}`;
    } else {
      const prevX = padding + (i - 1) * xScale;
      const prevY = height - padding - data[i - 1].total * yScale;
      const cx = (prevX + x) / 2;
      //Q = quadratic Bézier curve (create a quadratic Bézier curve)
      //T = smooth quadratic Bézier curveto (create a smooth quadratic Bézier curve)
      pathD += ` Q ${prevX},${prevY} ${cx},${(prevY + y) / 2}`;
      pathD += ` T ${x},${y}`;
    }
  }

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathD);
  path.setAttribute("stroke", getCssVar("--primary", "#ff7a59"));
  path.setAttribute("stroke-width", 2.5);
  path.setAttribute("fill", "none");
  svg.appendChild(path);

  // Points (dots) with tooltip
  data.forEach((d, i) => {
    const x = padding + i * xScale;
    const y = height - padding - d.total * yScale;

    const circle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", 4);
    circle.setAttribute("fill", getCssVar("--accent", "#ffd166"));
    svg.appendChild(circle);

    const tooltip = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "title"
    );
    tooltip.textContent = `${d.date}: ${(d.total / 1000).toFixed(1)} kB`;
    circle.appendChild(tooltip);
  });

  // X axis line
  const xAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
  xAxis.setAttribute("x1", padding);
  xAxis.setAttribute("y1", height - padding);
  xAxis.setAttribute("x2", width - padding);
  xAxis.setAttribute("y2", height - padding);
  xAxis.setAttribute("stroke", axisColor);
  svg.appendChild(xAxis);

  // Y axis line
  const yAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
  yAxis.setAttribute("x1", padding);
  yAxis.setAttribute("y1", padding);
  yAxis.setAttribute("x2", padding);
  yAxis.setAttribute("y2", height - padding);
  yAxis.setAttribute("stroke", axisColor);
  svg.appendChild(yAxis);
}

function logout() {
  localStorage.removeItem("jwt");
  window.location.href = "index.html";
}

loadProfile();
