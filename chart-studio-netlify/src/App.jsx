import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from "recharts";
import { Download, Copy, Check } from "lucide-react";
import Papa from "papaparse";

/* ============================================================
   BRAND TOKENS  —  the single swap point.
   Replace these with The Measure's real hex values + fonts and
   the entire system (preview + every exported embed) restyles.
   ============================================================ */
/* The Measure uses the native system UI stack (Ghost default) — San Francisco
   on Apple, Segoe UI on Windows, Roboto on Android. We match it exactly so
   charts render in the same face as the surrounding article, with no font load.
   Alfa Slab One is the one webfont we pull in, reserved for the Big Stat. */
const SYS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif";

const BRAND = {
  name: "THE MEASURE",
  ink: "#14110F",          // near-black, editorial
  paper: "#FBFAF7",        // warm off-white card bg
  accent: "#E8412B",       // primary series / signature accent
  series: ["#E8412B", "#1E5F74", "#E6A100", "#5A4FCF", "#2E9E6B"],
  grid: "#E7E2DA",
  muted: "#8A8175",
  // The Measure = native system UI stack (matches the site exactly, no load).
  fontDisplay: SYS,                          // headlines (use weight 700)
  fontBody: SYS,                             // body / labels
  fontStat: `'Alfa Slab One', ${SYS}`,       // Giza-like fat slab, big stats only
};

/* ============================================================
   CHART PALETTES — themeable colors per chart (card bg + chart
   colors). Fonts/logo stay in BRAND; only colors swap here.
   ============================================================ */
const VERSION = "v01.6"; // build/deploy version — increment minor (v01.1, v01.2 …) each .zip build until v02 is declared
const PALETTES = {
  white: { name: "White", paper: "#FFFFFF", ink: "#16130F", grid: "#ECEAE6", muted: "#736E66",
    accent: "#E8412B", series: ["#E8412B", "#1E5F74", "#E6A100", "#5A4FCF", "#2E9E6B"] },
  cream: { name: "Cream", paper: "#FBFAF7", ink: "#14110F", grid: "#E7E2DA", muted: "#8A8175",
    accent: "#E8412B", series: ["#E8412B", "#1E5F74", "#E6A100", "#5A4FCF", "#2E9E6B"] },
  slate: { name: "Space gray", paper: "#21262C", ink: "#F4F2EE", grid: "#39414A", muted: "#9BA3AD",
    accent: "#FF6A4D", series: ["#FF6A4D", "#5BC0DE", "#F2C14E", "#9B8CFF", "#5FD6A0"] },
};
const palOf = (c) => PALETTES[(c && c.palette) || "white"] || PALETTES.white;

/* ---- font loading (swap point: drop in your licensed fonts) ---- */
function useBrandFonts() {
  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href =
      "https://fonts.googleapis.com/css2?family=Alfa+Slab+One&display=swap";
    document.head.appendChild(l);
    return () => { document.head.removeChild(l); };
  }, []);
}

/* ============================================================
   SAMPLE DATA — real figures pulled from a Measure article so
   it's recognizable on first load.
   ============================================================ */
const SAMPLES = {
  line: {
    title: "Colbert's ad spend slid, rebounded in 2025, then halved YTD",
    subtitle: "Est. national linear TV ad spend during The Late Show With Stephen Colbert, 2022–2026",
    source: "Source: iSpot · The Measure",
    unit: "$M",
    rows: [
      { label: "2022", "Ad spend": 75.7 },
      { label: "2023", "Ad spend": 61.7 },
      { label: "2024", "Ad spend": 57.1 },
      { label: "2025", "Ad spend": 63.8 },
      { label: "2026 YTD", "Ad spend": 32.8 },
    ],
    series: ["Ad spend"],
  },
  bar: {
    title: "YouTube viewer growth across late-night, April YoY",
    subtitle: "Unique U.S. YouTube viewers, % change year-over-year",
    source: "Source: Tubular Labs · The Measure",
    unit: "%",
    rows: [
      { label: "Colbert", Growth: 30 },
      { label: "Fallon", Growth: 12 },
      { label: "Kimmel", Growth: 9 },
      { label: "Daily Show", Growth: 7 },
    ],
    series: ["Growth"],
  },
  hbar: {
    title: "Comics Unleashed reach is exploding by category",
    subtitle: "YoY increase in ad reach during the show, by industry",
    source: "Source: iSpot · The Measure",
    unit: "x",
    rows: [
      { label: "OTC allergy/cold", Multiple: 81 },
      { label: "Cleaning supplies", Multiple: 40 },
      { label: "Wireless", Multiple: 34 },
    ],
    series: ["Multiple"],
  },
  stat: {
    title: "Comics Unleashed reach, Jan–mid May YoY",
    subtitle: "The replacement show is building an audience fast",
    source: "Source: iSpot · The Measure",
    statValue: "+1,157%",
    statLabel: "increase in ad reach year-over-year",
    statDelta: "ad airings up just 6.5% over the same period",
  },
};

/* ---- helpers ---- */
const fmt = (n, unit) => {
  if (typeof n !== "number" || isNaN(n)) return n;
  const v = Number.isInteger(n) ? n : n.toFixed(1);
  if (unit === "%") return `${v}%`;
  if (unit === "x") return `${v}x`;
  if (unit === "$M") return `$${v}M`;
  return `${v}`;
};

/* Source-first ingest: parse a spreadsheet paste (tab OR comma — Sheets/Excel
   paste is tab-delimited) into headers + a raw string matrix. Mapping happens
   after, so the analyst confirms dimension / series / unit. */
function parseTable(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) return null;
  const delim = lines[0].includes("\t") ? "\t" : ",";
  const split = (l) => l.split(delim).map((c) => c.trim());
  return { headers: split(lines[0]), matrix: lines.slice(1).map(split), delim };
}
const toNum = (v) => parseFloat(String(v == null ? "" : v).replace(/[$,%x×]/gi, "").trim());
function isNumericCol(matrix, c) {
  let ok = 0, tot = 0;
  for (const r of matrix) if (r[c] !== undefined && r[c] !== "") { tot++; if (!isNaN(toNum(r[c]))) ok++; }
  return tot > 0 && ok / tot >= 0.6;
}
function detectUnit(headers, matrix, cols) {
  const s = cols.map((c) => headers[c]).join(" ") + " " +
    matrix.slice(0, 3).map((r) => cols.map((c) => r[c]).join(" ")).join(" ");
  if (/\$/.test(s)) return "$M";
  if (/%/.test(s)) return "%";
  if (/\bx\b|×/i.test(s)) return "x";
  return "";
}
// pick the right chart archetype from the data's shape (no AI needed for clean tabular data)
function classifyArchetype(headers, matrix, labelCol, seriesCols) {
  const rows = matrix.filter((r) => String(r[labelCol] == null ? "" : r[labelCol]).trim() !== "");
  const n = rows.length;
  const sers = (seriesCols || []).filter((c) => c !== labelCol);
  if (n <= 1 && sers.length <= 1) return "stat";
  const labels = rows.map((r) => String(r[labelCol] == null ? "" : r[labelCol]).trim());
  const isTime = (x) => /^(19|20)\d{2}$/.test(x) || /\b(19|20)\d{2}\b/.test(x)
    || /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(x)
    || /^q[1-4]\b/i.test(x) || /^\d{4}-\d{1,2}/.test(x);
  const timeShare = labels.length ? labels.filter(isTime).length / labels.length : 0;
  if (timeShare >= 0.6) return "line";
  if (sers.length === 1) {
    const vals = rows.map((r) => toNum(r[sers[0]])).filter((v) => !isNaN(v));
    const sortedDesc = vals.length >= 3 && vals.every((v, i) => i === 0 || v <= vals[i - 1]);
    const longLabels = labels.some((l) => l.length > 12);
    if (n >= 5 || sortedDesc || longLabels) return "hbar";
    return "bar";
  }
  return "bar";
}

/* ---- custom tooltip themed to brand ---- */
function BrandTooltip({ active, payload, label, unit, pal = PALETTES.cream }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: pal.ink, color: pal.paper, padding: "8px 11px",
      borderRadius: 6, fontFamily: BRAND.fontBody, fontSize: 12.5,
      fontVariantNumeric: "tabular-nums", boxShadow: "0 6px 24px rgba(0,0,0,.25)",
    }}>
      <div style={{ opacity: 0.7, marginBottom: 3 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ width: 9, height: 9, background: p.color, borderRadius: 2, display: "inline-block" }} />
          <strong>{p.name}: {fmt(p.value, unit)}</strong>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   THE BRANDED CHART CARD  —  what gets embedded.
   ============================================================ */
function hexToRgb(h) { h = h.replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function rgbToHex(r, g, b) { const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0"); return "#" + c(r) + c(g) + c(b); }
function mixHex(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
// Sequential single-hue ramp: largest value = full brand color, smaller values fade toward the card paper.
function valueRamp(pal, values) {
  const nums = values.map((v) => (typeof v === "number" ? v : parseFloat(v) || 0));
  const max = Math.max(...nums), min = Math.min(...nums), span = (max - min) || 1;
  return nums.map((v) => mixHex(pal.series[0], pal.paper, (1 - (v - min) / span) * 0.6));
}

function ChartCard({ type, cfg, pal = PALETTES.cream }) {
  const axisStyle = { fontFamily: BRAND.fontBody, fontSize: 12, fill: pal.muted, fontVariantNumeric: "tabular-nums" };

  const renderChart = () => {
    if (type === "stat") {
      return (
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", padding: "8px 4px" }}>
          <div style={{
            fontFamily: BRAND.fontStat, fontSize: "clamp(56px, 21vw, 160px)",
            lineHeight: 0.84, color: pal.accent, fontWeight: 400, letterSpacing: "-0.015em",
          }}>{cfg.statValue}</div>
          <div style={{ fontFamily: BRAND.fontBody, fontSize: 18, color: pal.ink, marginTop: 10, maxWidth: 460 }}>
            {cfg.statLabel}
          </div>
          {cfg.statDelta && (
            <div style={{ fontFamily: BRAND.fontBody, fontSize: 13.5, color: pal.muted, marginTop: 8 }}>
              {cfg.statDelta}
            </div>
          )}
        </div>
      );
    }
    const data = cfg.rows.map((r) => { const o = { label: r.label }; cfg.series.forEach((s) => { o[s] = toNum(r[s]); }); return o; });
    if (type === "hbar") {
      const colors = valueRamp(pal, cfg.rows.map((r) => r[cfg.series[0]]));
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" barCategoryGap="20%" margin={{ top: 4, right: 28, left: 8, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke={pal.grid} />
            <XAxis type="number" tick={axisStyle} axisLine={{ stroke: pal.grid }} tickLine={false}
              tickFormatter={(v) => fmt(v, cfg.unit)} />
            <YAxis type="category" dataKey="label" tick={axisStyle} width={120} axisLine={false} tickLine={false} />
            <Tooltip content={<BrandTooltip unit={cfg.unit} pal={pal} />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
            <Bar dataKey={cfg.series[0]} radius={[0, 4, 4, 0]}>
              {cfg.rows.map((_, i) => <Cell key={i} fill={colors[i]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }
    if (type === "bar") {
      const colors = valueRamp(pal, cfg.rows.map((r) => r[cfg.series[0]]));
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap="20%" margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={pal.grid} />
            <XAxis dataKey="label" tick={axisStyle} axisLine={{ stroke: pal.grid }} tickLine={false} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v, cfg.unit)} />
            <Tooltip content={<BrandTooltip unit={cfg.unit} pal={pal} />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
            {cfg.series.length > 1 && <Legend wrapperStyle={{ fontFamily: BRAND.fontBody, fontSize: 12 }} />}
            {cfg.series.length === 1 ? (
              <Bar dataKey={cfg.series[0]} radius={[4, 4, 0, 0]}>
                {cfg.rows.map((_, i) => <Cell key={i} fill={colors[i]} />)}
              </Bar>
            ) : (
              cfg.series.map((s, i) => (
                <Bar key={s} dataKey={s} fill={pal.series[i % pal.series.length]} radius={[4, 4, 0, 0]} />
              ))
            )}
          </BarChart>
        </ResponsiveContainer>
      );
    }
    // line
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 18, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={pal.grid} />
          <XAxis dataKey="label" tick={axisStyle} axisLine={{ stroke: pal.grid }} tickLine={false} />
          <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v, cfg.unit)} />
          <Tooltip content={<BrandTooltip unit={cfg.unit} pal={pal} />} />
          {cfg.series.length > 1 && <Legend wrapperStyle={{ fontFamily: BRAND.fontBody, fontSize: 12 }} />}
          {cfg.series.map((s, i) => (
            <Line key={s} type="monotone" dataKey={s} stroke={pal.series[i % pal.series.length]}
              strokeWidth={2.5} dot={{ r: 3, strokeWidth: 0, fill: pal.series[i % pal.series.length] }}
              activeDot={{ r: 5 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div style={{
      background: pal.paper, border: `1px solid ${pal.grid}`, borderRadius: 12,
      padding: "22px 24px 16px", display: "flex", flexDirection: "column",
      boxShadow: "0 1px 2px rgba(0,0,0,0.04)", height: "100%", boxSizing: "border-box",
    }}>
      {/* header */}
      <div style={{ borderTop: `3px solid ${pal.accent}`, paddingTop: 12, marginBottom: 6 }}>
        <div style={{ fontFamily: BRAND.fontDisplay, fontSize: 20, lineHeight: 1.2, color: pal.ink, fontWeight: 700, letterSpacing: "-0.005em" }}>
          {cfg.title}
        </div>
        {cfg.subtitle && (
          <div style={{ fontFamily: BRAND.fontBody, fontSize: 13, color: pal.muted, marginTop: 5 }}>
            {cfg.subtitle}
          </div>
        )}
      </div>
      {/* chart */}
      <div style={{ flex: 1, minHeight: 0, marginTop: 6 }}>{renderChart()}</div>
      {/* footer: source + wordmark — automatic on every chart */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginTop: 10, paddingTop: 10, borderTop: `1px solid ${pal.grid}`,
      }}>
        <span style={{ fontFamily: BRAND.fontBody, fontSize: 11, color: pal.muted }}>{cfg.source}</span>
        <Logo height={12} color={pal.ink} />
      </div>
    </div>
  );
}

/* ============================================================
   EMBED CODE GENERATOR
   Produces a self-contained <iframe srcdoc> using Chart.js from
   a CDN, themed with the brand tokens. Paste into a Ghost HTML
   card. (In production this points at your own hosted renderer.)
   ============================================================ */
function embedDoc(type, cfg, pal = PALETTES.cream) {
  const sansEmbed = "-apple-system, BlinkMacSystemFont, system-ui, sans-serif";
  const statEmbed = "&quot;Alfa Slab One&quot;, " + sansEmbed;
  if (type === "stat") {
    return `<!doctype html><meta charset="utf-8">
<style>html,body{height:100%;margin:0}*{box-sizing:border-box}</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alfa+Slab+One&display=swap">
<div style="font-family:${sansEmbed};background:${pal.paper};border:1px solid ${pal.grid};border-radius:12px;height:100%;display:flex;flex-direction:column;padding:4% 5%">
  <div style="border-top:3px solid ${pal.accent};padding-top:12px">
    <div style="font-family:${sansEmbed};font-size:clamp(15px,2.6vw,21px);color:${pal.ink};font-weight:700">${cfg.title}</div>
    <div style="font-size:clamp(11px,1.7vw,14px);color:${pal.muted};margin-top:5px">${cfg.subtitle || ""}</div>
  </div>
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center;min-height:0;overflow:hidden">
    <div id="stat" style="font-family:${statEmbed};font-size:clamp(40px,18vw,150px);color:${pal.accent};line-height:1.02;letter-spacing:-0.01em;white-space:nowrap">${cfg.statValue}</div>
    <div style="font-size:clamp(13px,2.2vw,19px);color:${pal.ink};margin-top:16px">${cfg.statLabel}</div>
    <div style="font-size:clamp(11px,1.7vw,14px);color:${pal.muted};margin-top:6px">${cfg.statDelta || ""}</div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid ${pal.grid};font-size:11px;color:${pal.muted}">
    <span>${cfg.source}</span><svg height="11" viewBox="${LOGO_VIEWBOX}" fill="${pal.ink}"><path fill-rule="nonzero" d="${LOGO_PATH}"/></svg>
  </div>
</div>
<script>
(function(){var el=document.getElementById('stat');if(!el)return;var box=el.parentElement;function fit(){var ideal=Math.min(box.clientWidth*0.24,150);el.style.fontSize=ideal+'px';var avail=box.clientWidth,nat=el.scrollWidth;if(nat>avail)el.style.fontSize=Math.max(20,Math.floor(ideal*avail/nat*0.96))+'px';}fit();window.addEventListener('resize',fit);})();
<\/script>`;
  }
  const labels = cfg.rows.map((r) => r.label);
  const single = cfg.series.length === 1 && (type === "bar" || type === "hbar");
  const ramp = single ? valueRamp(pal, cfg.rows.map((r) => r[cfg.series[0]])) : null;
  const datasets = cfg.series.map((s, i) => ({
    label: s, data: cfg.rows.map((r) => toNum(r[s])),
    backgroundColor: single ? ramp : pal.series[i % pal.series.length],
    borderColor: single ? ramp : pal.series[i % pal.series.length],
    borderWidth: type === "line" ? 2.5 : 0, borderRadius: type === "line" ? 0 : 4,
    tension: 0.35, pointRadius: 3, fill: false,
  }));
  const cjsType = type === "line" ? "line" : "bar";
  const indexAxis = type === "hbar" ? "y" : "x";
  const config = { type: cjsType, data: { labels, datasets }, options: {
    indexAxis, responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: cfg.series.length > 1, labels: { color: pal.ink, font: { family: "system-ui, sans-serif" } } } },
    scales: {
      x: { grid: { display: indexAxis === "y" }, ticks: { font: { family: "system-ui, sans-serif" }, color: pal.muted } },
      y: { grid: { color: pal.grid }, ticks: { font: { family: "system-ui, sans-serif" }, color: pal.muted } },
    },
  } };
  return `<!doctype html><meta charset="utf-8">
<style>html,body{height:100%;margin:0}*{box-sizing:border-box}</style>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"><\/script>
<div style="font-family:${sansEmbed};background:${pal.paper};border:1px solid ${pal.grid};border-radius:12px;height:100%;display:flex;flex-direction:column;padding:3.5% 4%">
  <div style="border-top:3px solid ${pal.accent};padding-top:10px;margin-bottom:6px">
    <div style="font-family:${sansEmbed};font-size:clamp(14px,2.5vw,20px);color:${pal.ink};font-weight:700">${cfg.title}</div>
    <div style="font-size:clamp(11px,1.7vw,13px);color:${pal.muted};margin-top:4px">${cfg.subtitle || ""}</div>
  </div>
  <div style="flex:1;position:relative;min-height:0"><canvas id="c"></canvas></div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid ${pal.grid};font-size:11px;color:${pal.muted}">
    <span>${cfg.source}</span><svg height="11" viewBox="${LOGO_VIEWBOX}" fill="${pal.ink}"><path fill-rule="nonzero" d="${LOGO_PATH}"/></svg>
  </div>
</div>
<script>new Chart(document.getElementById("c"), ${JSON.stringify(config)});<\/script>`;
}

function buildEmbed(type, cfg, pal = PALETTES.cream) {
  // escape apostrophes so user text (e.g. "Colbert's") can't break the srcdoc attribute
  const doc = embedDoc(type, cfg, pal).replace(/'/g, "&#39;");
  return `<div style="position:relative;width:100%;max-width:720px;margin:0 auto;height:0;padding-bottom:56.25%"><iframe style="position:absolute;inset:0;width:100%;height:100%;border:0" srcdoc='${doc}'></iframe></div>`;
}

/* ============================================================
   APP
   ============================================================ */
const TYPES = [
  { id: "line", label: "Time series" },
  { id: "bar", label: "Comparison" },
  { id: "hbar", label: "Ranking" },
  { id: "stat", label: "Big stat" },
];

/* ============================================================
   PNG EXPORT HELPERS — composite the recharts vector + branded
   chrome onto a canvas, no external rasterization library.
   ============================================================ */
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function wrapText(ctx, text, x, y, maxW, lh) {
  const words = String(text || "").split(" ");
  let line = "";
  for (let n = 0; n < words.length; n++) {
    const test = line ? line + " " + words[n] : words[n];
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y); line = words[n]; y += lh;
    } else { line = test; }
  }
  ctx.fillText(line, x, y);
  return y + lh;
}
function svgToImage(svgEl) {
  return new Promise((resolve, reject) => {
    const clone = svgEl.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const rect = svgEl.getBoundingClientRect();
    if (!clone.getAttribute("width")) clone.setAttribute("width", Math.round(rect.width));
    if (!clone.getAttribute("height")) clone.setAttribute("height", Math.round(rect.height));
    const xml = new XMLSerializer().serializeToString(clone);
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/* ============================================================
   THE MEASURE LOGOTYPE — vectorized from THE_MEASURE_BLACK.eps
   (all glyph paths merged into one). Recolors from a single path
   via the `color` prop: ink on the card, white on dark.
   ============================================================ */
const LOGO_VIEWBOX = "14.5 17 733.5 55";
const LOGO_ASPECT = 733.5 / 55;
const LOGO_PATH = "M82.8,42.8h-14.9v-12h-6.6v26.9h6.8v13.1H29.1v-13.1h7.3v-26.9h-6.7v12h-15.1v-24.5h68.2v24.5Z M160.7,70.8h-37v-13.1h5.1v-9.6h-12.3v9.6h5v13.1h-36.9v-13.1h6.4v-26.4h-6.4v-13h36.9v13h-5v9.7h12.3v-9.7h-5.1v-13h37v13h-6.4v26.4h6.4v13.1Z M160.7,70.8h-37v-13.1h5.1v-9.6h-12.3v9.6h5v13.1h-36.9v-13.1h6.4v-26.4h-6.4v-13h36.9v13h-5v9.7h12.3v-9.7h-5.1v-13h37v13h-6.4v26.4h6.4v13.1Z M228.9,70.8h-65.7v-13.1h6.4v-26.4h-6.4v-13h65.4v24.5h-16.7v-11.7h-17.2v8.4h13.5v10.9h-13.5v7.5h17.1c0-2.5,0-5.3,0-7.9v-2.5h17.1v23.3Z M406.6,70.8h-65.7v-13.1h6.4v-26.4h-6.4v-13h65.4v24.5h-16.7v-11.7h-17.2v8.4h13.5v10.9h-13.5v7.5h17.1c0-2.5,0-5.3,0-7.9v-2.5h17.1v23.3Z M475.5,70.8h-38.5v-13.1h5.5c-.7-2-1.3-4-1.9-6.1h-9.8c-.6,2-1.2,4-1.9,6.1h5.9v13.1h-26.3v-13.1h5.1c4.9-13.1,9.6-26.3,14.5-39.4h26.2c4.5,13.2,9.2,26.4,14.2,39.4h6.9v13.1ZM438.9,45.5c-1.1-3.5-2.3-6.9-3.2-10.5-.9,3.5-2.1,7-3.2,10.5h6.4Z M534.1,51.8c0,12.3-8.6,20-22.1,20s-13.5-1.2-19.5-5.6l-.4,4.6h-13.6v-19.1l10.7-.3c3.7,5.9,13.9,10.4,21.5,10.4s5.8-.4,5.8-3c0-4.2-8.9-4-17.9-5.3-11.5-1.7-19.8-6.7-19.8-18.5s10.1-17.8,23.2-17.8,11.2,1.9,16.3,5.7v-4.6h13.4v17.4h-10.5c-4.8-4.9-12.4-8.2-19.6-8.2s-6.1-.1-6.1,2.5,1.1,1.8,2.1,2.2c1.6.5,5.8,1,8.4,1.3,13.2,1.4,28.3,2.6,28.3,18.3Z M606.3,31.3h-7.4v13.2c0,9,1.2,17.5-8.5,22.7-6.4,3.4-13.9,4.6-21.3,4.6s-16.6-.9-22.4-5.5c-4.5-3.7-6.8-8.3-6.8-13.8v-21.1h-6.1v-13h39v13h-6.9v20.8c0,4.6,2.8,7.2,8,7.2s7.7-3.4,7.7-8.3v-19.6h-6.6v-13h31.4v13Z M665,71.8c-14.5,0-17.2-6.5-17.9-18.3,0-1.1-.2-2.8-1-3.7-1.1-1.4-3.5-1.6-5.6-1.6v9.5h5v13.1h-36.3v-13.1h6.4v-26.4h-6.4v-13h43.2c10.4,0,20.9,3.2,20.9,14.2s-6.9,12.1-15.4,12.4c-.7,0-1.2,0-1.9.1,4.1.5,6.8.7,10.6,3.5,5.4,4,3.8,10.3,5,11.2.3.3.8.5,1.2.5,2.1,0,1.8-4,1.7-5.3h5.5c.2,1.2.2,2.4.2,3.5,0,9-5.5,13.3-15.3,13.3ZM649.4,35.9c0-4.6-2.3-4.9-6.8-4.9h-2.1v10h1.7c4.5,0,7.2-.5,7.2-5.1Z M747.9,70.8h-65.7v-13.1h6.4v-26.4h-6.4v-13h65.4v24.5h-16.7v-11.7h-17.2v8.4h13.5v10.9h-13.5v7.5h17.1c0-2.5,0-5.3,0-7.9v-2.5h17.1v23.3Z M338.8,70.8h-37.4v-13.1h6.2v-22.9c-1.9,6.1-4,12.1-6.2,18.1-2.1,5.9-3.9,11.9-5.9,17.8h-10.9c-2.1-5.2-3.9-10.3-5.9-15.5-2.5-6.5-4.6-13.3-7.4-19.6v22h6.8v13.1h-31.4v-13.1h6.4v-26.4h-6.4v-13h43.6c1.6,4.7,3.5,9.3,5,14,1.7-4.8,3.7-9.4,5.7-14h37.8v13h-6.4v26.4h6.4v13.1Z";
function Logo({ height = 12, color = BRAND.ink }) {
  return (
    <svg viewBox={LOGO_VIEWBOX} height={height} width={height * LOGO_ASPECT}
         fill={color} role="img" aria-label="The Measure" style={{ display: "block" }}>
      <path fillRule="nonzero" d={LOGO_PATH} />
    </svg>
  );
}
const logoSvgString = (color) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEWBOX}" fill="${color}"><path fill-rule="nonzero" d="${LOGO_PATH}"/></svg>`;
function svgStringToImage(str) {
  return new Promise((resolve, reject) => {
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(str);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function drawPlot(ctx, type, cfg, pal, x, y, w, h) {
  const series = cfg.series || [], rows = cfg.rows || [];
  if (!rows.length || !series.length) return;
  const vals = []; rows.forEach((r) => series.forEach((s) => vals.push(toNum(r[s]))));
  let vmax = Math.max(...vals, 0), vmin = Math.min(...vals, 0);
  if (vmax === vmin) vmax = vmin + 1;
  const single = series.length === 1 && (type === "bar" || type === "hbar");
  const ramp = single ? valueRamp(pal, rows.map((r) => r[series[0]])) : null;
  const colorFor = (si, ri) => (single ? ramp[ri] : pal.series[si % pal.series.length]);
  ctx.save();
  ctx.font = `400 11px ${SYS}`;
  ctx.textBaseline = "middle";
  if (type === "hbar") {
    const labelW = 104, plotX = x + labelW, plotW = w - labelW;
    const v0 = Math.min(0, vmin), span = (vmax - v0) || 1;
    const sx = (v) => plotX + plotW * ((v - v0) / span);
    const band = h / rows.length, barH = band * 0.62;
    rows.forEach((r, ri) => {
      const cy = y + band * ri + band / 2, x0 = sx(0), x1 = sx(toNum(r[series[0]]));
      ctx.fillStyle = colorFor(0, ri);
      roundRectPath(ctx, Math.min(x0, x1), cy - barH / 2, Math.max(1, Math.abs(x1 - x0)), barH, 4); ctx.fill();
      ctx.fillStyle = pal.muted; ctx.textAlign = "right"; ctx.fillText(String(r.label), x + labelW - 8, cy);
    });
    ctx.restore(); return;
  }
  const gutterL = 40, gutterB = 20;
  const plotX = x + gutterL, plotW = w - gutterL, plotY = y, plotH = h - gutterB;
  const span = (vmax - vmin) || 1, yPx = (v) => plotY + plotH * (1 - (v - vmin) / span);
  ctx.strokeStyle = pal.grid; ctx.lineWidth = 1; ctx.textAlign = "right"; ctx.fillStyle = pal.muted;
  for (let t = 0; t <= 4; t++) {
    const val = vmin + span * (t / 4), py = yPx(val);
    ctx.beginPath(); ctx.moveTo(plotX, py); ctx.lineTo(plotX + plotW, py); ctx.stroke();
    ctx.fillText(fmt(val, cfg.unit), x + gutterL - 6, py);
  }
  const band = plotW / rows.length;
  ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = pal.muted;
  rows.forEach((r, ri) => ctx.fillText(String(r.label), plotX + band * ri + band / 2, plotY + plotH + 5));
  ctx.textBaseline = "middle";
  if (type === "bar") {
    const bw = band * (single ? 0.66 : 0.78 / series.length), y0 = yPx(Math.max(0, vmin));
    rows.forEach((r, ri) => series.forEach((s, si) => {
      const cx = plotX + band * ri + band / 2;
      const bx = single ? cx - bw / 2 : cx - (series.length * bw) / 2 + si * bw;
      const py = yPx(toNum(r[s]));
      ctx.fillStyle = colorFor(si, ri);
      roundRectPath(ctx, bx, Math.min(py, y0), Math.max(1, bw - 2), Math.max(1, Math.abs(py - y0)), 4); ctx.fill();
    }));
  } else {
    series.forEach((s, si) => {
      const col = pal.series[si % pal.series.length];
      ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath();
      rows.forEach((r, ri) => { const cx = plotX + band * ri + band / 2, py = yPx(toNum(r[s])); ri === 0 ? ctx.moveTo(cx, py) : ctx.lineTo(cx, py); });
      ctx.stroke(); ctx.fillStyle = col;
      rows.forEach((r, ri) => { const cx = plotX + band * ri + band / 2, py = yPx(toNum(r[s])); ctx.beginPath(); ctx.arc(cx, py, 3, 0, Math.PI * 2); ctx.fill(); });
    });
  }
  ctx.restore();
}

/* ---- step-flow style atoms ---- */
const panelTitle = { fontSize: 13, fontWeight: 700, color: BRAND.ink, marginBottom: 8 };
const taStyle = { width: "100%", fontFamily: "monospace", fontSize: 12, padding: 10, borderRadius: 8, border: `1px solid ${BRAND.grid}`, boxSizing: "border-box", background: "#fff", lineHeight: 1.5 };
const ctxLbl = { fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: BRAND.muted, marginBottom: 8 };

/* ============================================================
   PERSISTENCE — charts are living objects: saved, listed, reopened.
   Backed by Netlify Blobs via /api/charts; falls back to in-memory when offline.
   ============================================================ */
// DEPLOY: window.storage is the artifact store. In a standalone .zip build it is absent, so this
// falls back to in-memory (lost on refresh). For a deployable proto, swap the fallback below to
// localStorage; for production, point it at your Ghost/GCP API.
const PREFIX = "chart:";
// DEPLOY: image extraction endpoint. Works in-artifact as-is (proxied, no key). For a standalone
// build, change this to your own proxy route, e.g. "/api/extract", which injects ANTHROPIC_API_KEY.
const EXTRACT_ENDPOINT = "/api/extract"; // deploy-ready: served by netlify/functions/extract.mjs
const _mem = {};
const STORE_ENDPOINT = "/api/charts"; // Netlify Blobs-backed persistence — served by netlify/functions/charts.mjs
const store = {
  async list(p) {
    try { const r = await fetch(STORE_ENDPOINT + "?prefix=" + encodeURIComponent(p)); if (r.ok) return await r.json(); } catch (e) {}
    return { keys: Object.keys(_mem).filter((k) => k.startsWith(p)) };
  },
  // one request returns every {key,value} under a prefix (keeps the library load to a single call)
  async all(p) {
    try { const r = await fetch(STORE_ENDPOINT + "?prefix=" + encodeURIComponent(p) + "&full=1"); if (r.ok) { const d = await r.json(); if (Array.isArray(d.items)) return d.items; } } catch (e) {}
    return Object.keys(_mem).filter((k) => k.startsWith(p)).map((k) => ({ key: k, value: _mem[k] }));
  },
  async get(k) {
    try { const r = await fetch(STORE_ENDPOINT + "?key=" + encodeURIComponent(k)); if (r.ok) { const d = await r.json(); return d && d.value != null ? { value: d.value } : null; } } catch (e) {}
    return k in _mem ? { value: _mem[k] } : null;
  },
  async set(k, v) {
    _mem[k] = v;
    try { const r = await fetch(STORE_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: k, value: v }) }); if (r.ok) return await r.json(); } catch (e) {}
    return { value: v };
  },
  async del(k) {
    delete _mem[k];
    try { const r = await fetch(STORE_ENDPOINT + "?key=" + encodeURIComponent(k), { method: "DELETE" }); if (r.ok) return await r.json(); } catch (e) {}
    return { deleted: true };
  },
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const now = () => Date.now();
const fmtDate = (t) => { try { return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch (e) { return ""; } };

function blankChart() {
  return {
    id: uid(), archetype: "line",
    title: "", subtitle: "", source: "Source: __ · The Measure", unit: "$M",
    rows: [{ label: "Item A", Value: 0 }, { label: "Item B", Value: 0 }], series: ["Value"],
    statValue: "+0%", statLabel: "", statDelta: "",
    palette: "white", provenance: "", createdAt: now(), updatedAt: now(),
  };
}
const _T = now();
const SEED = {
  id: "seed-ispot-colbert", archetype: "line",
  title: "Colbert's ad spend slid, rebounded in 2025, then halved YTD",
  subtitle: "Est. national linear TV ad spend during The Late Show With Stephen Colbert, 2022–2026",
  source: "Source: iSpot · The Measure", unit: "$M",
  rows: [
    { label: "2022", "Ad spend": 75.7 }, { label: "2023", "Ad spend": 61.7 },
    { label: "2024", "Ad spend": 57.1 }, { label: "2025", "Ad spend": 63.8 },
    { label: "2026 YTD", "Ad spend": 32.8 },
  ],
  series: ["Ad spend"], statValue: "", statLabel: "", statDelta: "",
  palette: "white", provenance: "iSpot export", createdAt: _T, updatedAt: _T,
};
const SEED_BAR = {
  id: "seed-ispot-impressions", archetype: "bar",
  title: "Ad impressions held up even as spend fell",
  subtitle: "Est. household ad impressions (billions) during The Late Show, 2022–2026",
  source: "Source: iSpot · The Measure", unit: "",
  rows: [
    { label: "2022", "Impressions": 11.8 }, { label: "2023", "Impressions": 11.4 },
    { label: "2024", "Impressions": 14.9 }, { label: "2025", "Impressions": 15.0 },
    { label: "2026 YTD", "Impressions": 6.0 },
  ],
  series: ["Impressions"], statValue: "", statLabel: "", statDelta: "",
  palette: "white", provenance: "iSpot export", createdAt: _T - 1000, updatedAt: _T - 1000,
};
const SEED_HBAR = {
  id: "seed-tubular-latenight", archetype: "hbar",
  title: "Colbert led late-night on YouTube in his final stretch",
  subtitle: "Est. unique U.S. viewers (millions), trailing 30 days",
  source: "Source: Tubular Labs · The Measure", unit: "",
  rows: [
    { label: "The Late Show", "Viewers": 8.4 }, { label: "The Daily Show", "Viewers": 7.2 },
    { label: "Jimmy Fallon", "Viewers": 6.1 }, { label: "Jimmy Kimmel", "Viewers": 5.3 },
    { label: "Last Week Tonight", "Viewers": 4.8 }, { label: "Seth Meyers", "Viewers": 3.4 },
  ],
  series: ["Viewers"], statValue: "", statLabel: "", statDelta: "",
  palette: "white", provenance: "Tubular estimate - verify against source", createdAt: _T - 2000, updatedAt: _T - 2000,
};
const SEED_STAT = {
  id: "seed-ispot-stat", archetype: "stat",
  title: "Impressions outpaced spend",
  subtitle: "The Late Show With Stephen Colbert, 2022–2025",
  source: "Source: iSpot · The Measure", unit: "",
  rows: [{ label: "2022", Value: 11.8 }, { label: "2025", Value: 15.0 }], series: ["Value"],
  statValue: "+27%", statLabel: "growth in household ad impressions, 2022 to 2025",
  statDelta: "11.8B → 15.0B even as ad spend dipped",
  palette: "white", provenance: "", createdAt: _T - 3000, updatedAt: _T - 3000,
};
const SEEDS = [SEED, SEED_BAR, SEED_HBAR, SEED_STAT];

const STEPS = [
  { id: "create", n: 1, label: "Create" },
  { id: "review", n: 2, label: "Review" },
  { id: "publish", n: 3, label: "Publish" },
];
const ARCHE = [
  { id: "line", label: "Change over time", hint: "a trend across dates" },
  { id: "bar", label: "Comparison", hint: "values across categories" },
  { id: "hbar", label: "Ranking", hint: "ordered, largest first" },
  { id: "stat", label: "Single number", hint: "one figure that matters" },
];

function Spinner({ label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span className="ms-spin" aria-hidden="true" />
      {label ? <span>{label}</span> : null}
    </span>
  );
}

function ChartEmbed({ chart }) {
  const doc = embedDoc(chart.archetype, chart, palOf(chart));
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ position: "relative", width: "100%", height: 0, paddingBottom: "56.25%" }}>
        <iframe title={chart.title || "chart"} srcDoc={doc} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} />
      </div>
    </div>
  );
}

function CropFrame({ chart }) {
  const doc = embedDoc(chart.archetype, chart, palOf(chart));
  const G = 5, L = 14, T = 1, c = "#1A1714";
  const seg = (st) => <span style={{ position: "absolute", background: c, ...st }} />;
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ position: "relative", width: "100%", height: 0, paddingBottom: "56.25%" }}>
        <iframe title={chart.title || "chart"} srcDoc={doc} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} />
        {seg({ top: 0, left: -(G + L), width: L, height: T })}{seg({ left: 0, top: -(G + L), width: T, height: L })}
        {seg({ top: 0, right: -(G + L), width: L, height: T })}{seg({ right: 0, top: -(G + L), width: T, height: L })}
        {seg({ bottom: 0, left: -(G + L), width: L, height: T })}{seg({ left: 0, bottom: -(G + L), width: T, height: L })}
        {seg({ bottom: 0, right: -(G + L), width: L, height: T })}{seg({ right: 0, bottom: -(G + L), width: T, height: L })}
      </div>
    </div>
  );
}

function LibraryTile({ chart, onOpen, onDuplicate, onDelete, actBusy }) {
  const editing = actBusy === chart.id + ":edit", duping = actBusy === chart.id + ":dup", busy = editing || duping;
  const arche = (ARCHE.find((a) => a.id === chart.archetype) || {}).label || chart.archetype;
  const src = (chart.source || "").replace(/^Source:\s*/, "").replace(/\s*·.*$/, "").trim() || "no source";
  return (
    <div style={{ border: `1px solid ${BRAND.grid}`, borderRadius: 12, background: "#fff", padding: 16, marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3, color: BRAND.ink }}>{chart.title || "Untitled chart"}</div>
          <div style={{ fontSize: 11.5, color: BRAND.muted, marginTop: 3 }}>{arche} · {src} · updated {fmtDate(chart.updatedAt)}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={() => onOpen(chart)} disabled={busy} style={{ ...actionBtn(BRAND.ink), padding: "6px 11px", minWidth: 56, justifyContent: "center" }}>{editing ? <Spinner /> : "Edit"}</button>
          <button onClick={() => onDuplicate(chart)} disabled={busy} style={{ ...miniBtn, display: "inline-flex", justifyContent: "center", minWidth: 78 }}>{duping ? <Spinner /> : "Duplicate"}</button>
          <button onClick={() => onDelete(chart)} disabled={busy} style={{ ...miniBtn, color: BRAND.accent }}>Delete</button>
        </div>
      </div>
      <ChartEmbed chart={chart} />
    </div>
  );
}

function Library({ charts, loading, onNew, onOpen, onDuplicate, onDelete, actBusy }) {
  return (
    <div style={{ padding: "26px 30px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: BRAND.fontDisplay, fontSize: 22, fontWeight: 700, color: BRAND.ink }}>Chart library</div>
          <div style={{ fontSize: 13, color: BRAND.muted, marginTop: 2 }}>Live embeds, exactly as they publish. Edit the data and the embed updates everywhere.</div>
        </div>
        <button onClick={onNew} style={{ ...actionBtn(BRAND.accent), marginLeft: "auto", padding: "10px 16px" }}>+ New chart</button>
      </div>
      {loading ? (
        <div style={{ color: BRAND.muted, fontSize: 14, padding: 40, textAlign: "center" }}><Spinner label="Loading library…" /></div>
      ) : charts.length === 0 ? (
        <div style={{ border: `1px dashed ${BRAND.grid}`, borderRadius: 12, padding: 48, textAlign: "center", color: BRAND.muted }}>
          No charts yet — start one with <strong>+ New chart</strong>.
        </div>
      ) : (
        <div>
          {charts.map((c) => <LibraryTile key={c.id} chart={c} onOpen={onOpen} onDuplicate={onDuplicate} onDelete={onDelete} actBusy={actBusy} />)}
        </div>
      )}
    </div>
  );
}

function Stepper({ step, setStep }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {STEPS.map((s, i) => (
        <React.Fragment key={s.id}>
          <button onClick={() => setStep(i)} style={{
            display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 20, cursor: "pointer",
            fontSize: 12.5, fontWeight: 600, fontFamily: BRAND.fontBody,
            border: `1px solid ${i === step ? BRAND.ink : BRAND.grid}`,
            background: i === step ? BRAND.ink : "#fff", color: i === step ? "#fff" : BRAND.muted }}>
            <span style={{ width: 18, height: 18, borderRadius: 9, display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, background: i === step ? "rgba(255,255,255,0.2)" : "#F2EFEA", color: i === step ? "#fff" : BRAND.muted }}>{s.n}</span>
            {s.label}
          </button>
          {i < STEPS.length - 1 && <span style={{ color: BRAND.grid }}>—</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function App() {
  useBrandFonts();
  const [view, setView] = useState("library");
  const [charts, setCharts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(null);
  const [previewChart, setPreviewChart] = useState(null);
  useEffect(() => { const id = setTimeout(() => setPreviewChart(draft), 200); return () => clearTimeout(id); }, [draft]);
  const [step, setStep] = useState(0);

  const [importText, setImportText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [labelCol, setLabelCol] = useState(0);
  const [seriesCols, setSeriesCols] = useState([]);
  const [impUnit, setImpUnit] = useState("");
  const [dataErr, setDataErr] = useState("");
  const [createMode, setCreateMode] = useState("paste"); // paste | image | blank
  const [imgSrc, setImgSrc] = useState(""); const [imgB64, setImgB64] = useState("");
  const [imgMime, setImgMime] = useState(""); const [imgBusy, setImgBusy] = useState(false); const [imgErr, setImgErr] = useState("");
  const [blankChose, setBlankChose] = useState(false); // has a type been picked in Start blank?
  const [copied, setCopied] = useState(false);
  const [pngBusy, setPngBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const previewRef = useRef(null);
  const embedRef = useRef(null);
  const [actBusy, setActBusy] = useState(null); // "<id>:edit" | "<id>:dup" while a library action runs

  const refresh = async () => {
    const items = await store.all(PREFIX);
    const out = [];
    for (const it of items) { if (it && it.value) { try { out.push(JSON.parse(it.value)); } catch (e) {} } }
    out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    setCharts(out);
  };
  useEffect(() => { (async () => {
    setLoading(true);
    const seeded = await store.get("meta:seeded3");
    if (!seeded) { for (const sd of SEEDS) { await store.set(PREFIX + sd.id, JSON.stringify(sd)); } await store.set("meta:seeded3", "1"); }
    await refresh();
    setLoading(false);
  })(); }, []);

  const patch = (p) => setDraft((d) => ({ ...d, ...p, updatedAt: now() }));
  const openEditor = (c) => {
    setDraft({ ...c }); setPreviewChart({ ...c }); setImportText(""); setParsed(null); setCopied(false); setSavedFlash(false);
    setCreateMode("paste"); setImgSrc(""); setImgB64(""); setImgMime(""); setImgErr(""); setImgBusy(false); setBlankChose(false);
    const hasData = c.archetype === "stat" ? !!c.statValue : (c.rows || []).some((r) => Object.entries(r).some(([k, v]) => k !== "label" && v));
    setStep(hasData ? 1 : 0); setView("editor");
  };
  const newChart = () => openEditor(blankChart());
  const openFromLib = (c) => { setActBusy(c.id + ":edit"); setTimeout(() => { setActBusy(null); openEditor(c); }, 320); };
  const duplicate = async (c) => { setActBusy(c.id + ":dup"); const copy = { ...c, id: uid(), title: (c.title || "Untitled") + " (copy)", createdAt: now(), updatedAt: now() }; await store.set(PREFIX + copy.id, JSON.stringify(copy)); await refresh(); setActBusy(null); };
  const remove = async (c) => { await store.del(PREFIX + c.id); refresh(); };
  const saveDraft = async () => { const c = { ...draft, updatedAt: now() }; await store.set(PREFIX + c.id, JSON.stringify(c)); setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1500); refresh(); };
  const saveAndClose = async () => { await saveDraft(); setView("library"); };

  const updateCell = (ri, key, val) => patch({ rows: draft.rows.map((r, i) => i === ri ? { ...r, [key]: val } : r) });
  const addRow = () => { const b = { label: "New" }; draft.series.forEach((s) => (b[s] = 0)); patch({ rows: [...draft.rows, b] }); };
  const removeRow = (ri) => patch({ rows: draft.rows.filter((_, i) => i !== ri) });

  const applyParsed = (p) => {
    if (!p || !p.headers.length || !p.matrix.length) { setDataErr("No rows found — needs a header row plus at least one data row."); return; }
    let lbl = p.headers.findIndex((_, c) => !isNumericCol(p.matrix, c)); if (lbl < 0) lbl = 0;
    const cols = p.headers.map((_, c) => c).filter((c) => c !== lbl);
    const sers = cols.filter((c) => isNumericCol(p.matrix, c));
    setDataErr(""); setParsed(p); setLabelCol(lbl); setSeriesCols(sers.length ? sers : cols); setImpUnit(detectUnit(p.headers, p.matrix, sers));
  };
  const onDataFile = async (e) => {
    const file = e.target.files && e.target.files[0]; e.target.value = ""; if (!file) return;
    const name = (file.name || "").toLowerCase();
    setDataErr("");
    try {
      let headers = [], matrix = [];
      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const XLSX = await import("xlsx");
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
        const arr = aoa.filter((r) => r.some((c) => String(c).trim() !== ""));
        headers = (arr[0] || []).map((c) => String(c).trim());
        matrix = arr.slice(1).map((r) => headers.map((_, i) => String(r[i] == null ? "" : r[i]).trim()));
      } else {
        const txt = await file.text();
        const res = Papa.parse(txt, { skipEmptyLines: true });
        const arr = (res.data || []).filter((r) => Array.isArray(r) && r.some((c) => String(c).trim() !== ""));
        headers = (arr[0] || []).map((c) => String(c).trim());
        matrix = arr.slice(1).map((r) => headers.map((_, i) => String(r[i] == null ? "" : r[i]).trim()));
      }
      applyParsed({ headers, matrix, delim: "," });
    } catch (err) {
      setDataErr("Couldn't read that file: " + ((err && err.message) ? err.message : "unknown error"));
    }
  };
  const parseImport = () => {
    const p = parseTable(importText);
    if (!p) { setDataErr("Need a header row plus at least one data row."); return; }
    applyParsed(p);
  };
  const toggleSeries = (c) => setSeriesCols((s) => s.includes(c) ? s.filter((x) => x !== c) : [...s, c]);
  const buildFromImport = () => {
    if (!parsed) return;
    const sers = seriesCols.filter((c) => c !== labelCol); if (!sers.length) return;
    const names = sers.map((c) => parsed.headers[c] || `Series ${c + 1}`);
    const rows = parsed.matrix.filter((r) => (r[labelCol] ?? "") !== "").map((r) => {
      const o = { label: r[labelCol] }; sers.forEach((c, i) => { const n = toNum(r[c]); o[names[i]] = isNaN(n) ? 0 : n; }); return o;
    });
    if (!rows.length) return;
    const arche = classifyArchetype(parsed.headers, parsed.matrix, labelCol, sers);
    if (arche === "stat") {
      patch({ archetype: "stat", statValue: String(rows[0][names[0]]), statLabel: names[0], unit: impUnit });
    } else {
      patch({ archetype: arche, rows, series: names, unit: impUnit });
    }
    setParsed(null); setImportText(""); setDataErr(""); setStep(1);
  };

  const embed = useMemo(() => draft ? buildEmbed(draft.archetype, draft, palOf(draft)) : "", [draft]);
  const copyEmbed = async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(embed); ok = true; } catch (e) {}
    if (!ok && embedRef.current) {
      try { const ta = embedRef.current; ta.focus(); ta.select(); ok = document.execCommand("copy"); ta.setSelectionRange(0, 0); ta.blur(); } catch (e) {}
    }
    if (!ok) {
      try { const t = document.createElement("textarea"); t.value = embed; t.style.position = "fixed"; t.style.opacity = "0"; document.body.appendChild(t); t.focus(); t.select(); ok = document.execCommand("copy"); document.body.removeChild(t); } catch (e) {}
    }
    setCopied(ok);
    setTimeout(() => setCopied(false), 1600);
  };

  async function downloadPNG() {
    if (!draft) return;
    setPngBusy(true);
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      const cfg = draft, type = draft.archetype;
      const pal = palOf(draft);
      const scale = 2, W = 720, H = 405, P = 28;
      const canvas = document.createElement("canvas"); canvas.width = W * scale; canvas.height = H * scale;
      const ctx = canvas.getContext("2d"); ctx.scale(scale, scale);
      roundRectPath(ctx, 0.5, 0.5, W - 1, H - 1, 12); ctx.fillStyle = pal.paper; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = pal.grid; ctx.stroke();
      ctx.fillStyle = pal.accent; ctx.fillRect(P, 22, W - 2 * P, 3);
      ctx.textBaseline = "top"; ctx.textAlign = "left"; ctx.fillStyle = pal.ink; ctx.font = `700 20px ${SYS}`;
      let y = wrapText(ctx, cfg.title, P, 34, W - 2 * P, 25);
      if (cfg.subtitle) { ctx.fillStyle = pal.muted; ctx.font = `400 13px ${SYS}`; y = wrapText(ctx, cfg.subtitle, P, y + 2, W - 2 * P, 17); }
      const footerY = H - 34;
      if (type === "stat") {
        ctx.fillStyle = pal.accent; ctx.font = `400 80px 'Alfa Slab One', ${SYS}`; ctx.textBaseline = "alphabetic";
        ctx.fillText(cfg.statValue, P, y + 92); ctx.textBaseline = "top";
        ctx.fillStyle = pal.ink; ctx.font = `400 18px ${SYS}`; let sy = wrapText(ctx, cfg.statLabel, P, y + 108, W - 2 * P, 24);
        if (cfg.statDelta) { ctx.fillStyle = pal.muted; ctx.font = `400 13px ${SYS}`; wrapText(ctx, cfg.statDelta, P, sy + 4, W - 2 * P, 17); }
      } else {
        const top = y + 14;
        drawPlot(ctx, type, cfg, pal, P, top, W - 2 * P, footerY - 14 - top);
      }
      ctx.strokeStyle = pal.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(P, footerY - 6); ctx.lineTo(W - P, footerY - 6); ctx.stroke();
      ctx.textBaseline = "middle"; ctx.fillStyle = pal.muted; ctx.font = `400 11px ${SYS}`; ctx.fillText(cfg.source || "", P, footerY + 8);
      const lH = 12, lW = lH * LOGO_ASPECT; const limg = await svgStringToImage(logoSvgString(pal.ink));
      ctx.drawImage(limg, W - P - lW, footerY + 8 - lH / 2, lW, lH);
      const a = document.createElement("a"); a.href = canvas.toDataURL("image/png"); a.download = `the-measure-${type}.png`; a.click();
    } catch (e) { console.error("PNG export failed", e); } finally { setPngBusy(false); }
  }

  const framed = draft && draft.title.trim() && /[A-Za-z0-9]/.test((draft.source || "").replace("Source:", "").replace("· The Measure", ""));

  return (
    <div style={{ fontFamily: BRAND.fontBody, background: "#F2EFEA", minHeight: "100vh", color: BRAND.ink }}>
      <style>{`
        button { transition: box-shadow .12s ease, filter .12s ease, transform .06s ease; }
        button:not(:disabled):hover { box-shadow: inset 0 0 0 999px rgba(125,125,125,0.14); cursor: pointer; }
        button:not(:disabled):active { transform: translateY(1px); }
        button:disabled { cursor: default; opacity: 0.9; }
        @keyframes ms-spin { to { transform: rotate(360deg); } }
        .ms-spin { display: inline-block; width: 14px; height: 14px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; box-sizing: border-box; animation: ms-spin 0.7s linear infinite; }
      `}</style>
      <div style={{ background: BRAND.ink, color: BRAND.paper, padding: "14px 22px", display: "flex", alignItems: "center", gap: 14 }}>
        <Logo height={17} color={BRAND.paper} />
        <span style={{ width: 1, height: 18, background: "rgba(255,255,255,0.25)" }} />
        <span style={{ fontFamily: BRAND.fontDisplay, fontSize: 15, opacity: 0.85 }}>Chart Studio</span>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: "rgba(255,255,255,0.16)", letterSpacing: "0.03em" }}>{VERSION}</span>
        {view === "editor" ? (
          <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
            {savedFlash && <span style={{ fontSize: 12, opacity: 0.75 }}>Saved ✓</span>}
            <button onClick={saveDraft} style={{ ...actionBtn("rgba(255,255,255,0.16)"), padding: "7px 13px" }}>Save</button>
            <button onClick={saveAndClose} style={{ ...actionBtn(BRAND.accent), padding: "7px 13px" }}>Save &amp; close</button>
          </span>
        ) : (
          <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.5 }}>prototype · charts persist locally</span>
        )}
      </div>

      {view === "library" ? (
        <Library charts={charts} loading={loading} onNew={newChart} onOpen={openFromLib} onDuplicate={duplicate} onDelete={remove} actBusy={actBusy} />
      ) : (
        <div>
          <div style={{ padding: "14px 22px", borderBottom: `1px solid ${BRAND.grid}`, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", background: "#FBFAF7" }}>
            <button onClick={() => { setView("library"); refresh(); }} style={miniBtn}>← Library</button>
            <Stepper step={step} setStep={setStep} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 400px) 1fr", alignItems: "stretch" }}>
            <div style={{ padding: 22, borderRight: `1px solid ${BRAND.grid}`, background: "#FBFAF7", minHeight: "70vh" }}>
              {renderStep()}
              <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
                {step > 0 && <button onClick={() => setStep(step - 1)} style={miniBtn}>← Back</button>}
                {step < STEPS.length - 1 && <button onClick={() => setStep(step + 1)} style={{ ...actionBtn(BRAND.ink), marginLeft: "auto" }}>Next: {STEPS[step + 1].label} →</button>}
              </div>
            </div>
            <div style={{ padding: "26px 30px", minWidth: 0, background: STEPS[step].id === "publish" ? "#fff" : "transparent" }}>
              {STEPS[step].id === "publish" ? renderPublish() : (
                <>
                  <div style={ctxLbl}>LIVE PREVIEW</div>
                  <ChartEmbed chart={previewChart || draft} />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function dataEditor() {
    if (draft.archetype === "stat") {
      return (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: BRAND.muted, margin: "2px 0 8px" }}>THE NUMBER</div>
          <Field label="Stat value" value={draft.statValue} onChange={(v) => patch({ statValue: v })} />
          <Field label="Stat label" value={draft.statLabel} onChange={(v) => patch({ statLabel: v })} />
          <Field label="Context line" value={draft.statDelta} onChange={(v) => patch({ statDelta: v })} />
        </>
      );
    }
    return (
      <>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: BRAND.muted }}>DATA</span>
          <button onClick={addRow} style={miniBtn}>+ Row</button>
        </div>
        <div style={{ border: `1px solid ${BRAND.grid}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: `1.3fr ${draft.series.map(() => "1fr").join(" ")} 28px`, background: "#F2EFEA", fontSize: 11, fontWeight: 600, color: BRAND.muted }}>
            <div style={cellHead}>Label</div>{draft.series.map((s) => <div key={s} style={cellHead}>{s}</div>)}<div style={cellHead}></div>
          </div>
          {draft.rows.map((r, ri) => (
            <div key={ri} style={{ display: "grid", gridTemplateColumns: `1.3fr ${draft.series.map(() => "1fr").join(" ")} 28px`, borderTop: `1px solid ${BRAND.grid}` }}>
              <input value={r.label} onChange={(e) => updateCell(ri, "label", e.target.value)} style={cellInput} />
              {draft.series.map((s) => <input key={s} value={r[s]} onChange={(e) => updateCell(ri, s, e.target.value)} style={{ ...cellInput, fontVariantNumeric: "tabular-nums" }} />)}
              <button onClick={() => removeRow(ri)} style={{ border: "none", background: "transparent", color: BRAND.muted, cursor: "pointer", fontSize: 15 }}>×</button>
            </div>
          ))}
        </div>
      </>
    );
  }

  function framingFields() {
    return (
      <>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: BRAND.muted, margin: "2px 0 8px" }}>FRAMING</div>
        <Field label="Headline (the takeaway)" value={draft.title} onChange={(v) => patch({ title: v })} />
        <Field label="Sub-head (the precise metric)" value={draft.subtitle} onChange={(v) => patch({ subtitle: v })} />
        <Field label="Source" value={draft.source} onChange={(v) => patch({ source: v })} />
        {!framed && <div style={{ fontSize: 11.5, color: BRAND.accent, marginTop: 2 }}>A takeaway headline and a partner source are required before publishing.</div>}
        {draft.archetype !== "stat" && (
          <div style={{ ...impRow, marginTop: 10 }}><span style={impLbl}>Unit</span>
            <select value={draft.unit} onChange={(e) => patch({ unit: e.target.value })} style={impSel}>
              <option value="">none</option><option value="$M">$M</option><option value="%">%</option><option value="x">x</option>
            </select></div>
        )}
      </>
    );
  }

  function handleImageFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setImgErr("");
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || "");
      setImgSrc(url);
      const comma = url.indexOf(",");
      setImgB64(comma >= 0 ? url.slice(comma + 1) : "");
      setImgMime(file.type || "image/png");
    };
    reader.readAsDataURL(file);
  }

  async function extractFromImage() {
    if (!imgB64) return;
    setImgBusy(true); setImgErr("");
    try {
      const prompt = 'Extract the data from this chart image so it can be rebuilt. Respond with ONLY a JSON object, no prose, no markdown fences. Schema: {"archetype":"line|bar|hbar|stat","title":"short takeaway headline","subtitle":"the precise metric and timeframe","source":"Source: PROVIDER. The Measure","unit":"$M or % or x or empty","series":["series name"],"rows":[{"label":"x value","SERIES_NAME":0}],"statValue":"big number string for stat else empty","statLabel":"what the stat measures else empty","statDelta":"context line for stat else empty"}. Use line for trends over time, bar for comparisons across categories, hbar for rankings, stat for a single headline number. Read labeled values exactly. Return ONLY the JSON.';
      // DEPLOY: works in-artifact via the proxy (no key). In a standalone build this call fails —
      // route it through your own /api endpoint that injects ANTHROPIC_API_KEY server-side.
      const res = await fetch(EXTRACT_ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // DEPLOY: set to a current vision-capable Claude model string from your Anthropic console
          model: "claude-sonnet-4-6", max_tokens: 2000,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: imgMime || "image/png", data: imgB64 } },
            { type: "text", text: prompt },
          ] }],
        }),
      });
      const data = await res.json();
      if (!res.ok || (data && (data.error || data.type === "error"))) {
        const m = (data && data.error && data.error.message) || (data && data.message) || ("HTTP " + res.status);
        throw new Error(m);
      }
      let text = (data.content || []).map((i) => i.text || "").join("\n").trim();
      text = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      const ja = text.indexOf("{"), jb = text.lastIndexOf("}");
      if (ja >= 0 && jb > ja) text = text.slice(ja, jb + 1);
      const j = JSON.parse(text);
      const arche = ["line", "bar", "hbar", "stat"].includes(j.archetype) ? j.archetype : "bar";
      patch({
        archetype: arche,
        title: j.title || "", subtitle: j.subtitle || "",
        source: j.source || "Source: __ . The Measure",
        unit: ["$M", "%", "x", ""].includes(j.unit) ? j.unit : "",
        series: Array.isArray(j.series) && j.series.length ? j.series : ["Value"],
        rows: Array.isArray(j.rows) && j.rows.length ? j.rows : [{ label: "A", Value: 0 }, { label: "B", Value: 0 }],
        statValue: j.statValue || "", statLabel: j.statLabel || "", statDelta: j.statDelta || "",
        provenance: "Extracted from image - verify against source",
      });
      setStep(1);
    } catch (err) {
      setImgErr("Couldn't read that image: " + ((err && err.message) ? err.message : "unknown error") + " - try a clearer crop, or use Paste data / Start blank.");
    } finally {
      setImgBusy(false);
    }
  }

  function renderStep() {
    const id = STEPS[step].id;
    if (id === "create") return (
      <>
        <div style={panelTitle}>Create a chart</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[["paste", "Paste data"], ["image", "From image"], ["blank", "Start blank"]].map(([m, lbl]) => (
            <button key={m} onClick={() => { setCreateMode(m); if (m === "blank") setBlankChose(false); }} style={{ flex: 1, padding: "8px 6px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: BRAND.fontBody,
              border: `1px solid ${createMode === m ? BRAND.ink : BRAND.grid}`, background: createMode === m ? BRAND.ink : "#fff", color: createMode === m ? "#fff" : BRAND.ink }}>{lbl}</button>
          ))}
        </div>

        {createMode === "paste" && (
          <>
            <div style={{ fontSize: 12, color: BRAND.muted, marginBottom: 10, lineHeight: 1.5 }}>Paste from the iSpot / Tubular export — tab or comma separated, first row = headers. Source data beats OCR.</div>
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={6} placeholder={"Year\tAd spend\n2022\t75.7\n2023\t61.7"} style={taStyle} />
            {!parsed ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button onClick={parseImport} disabled={!importText.trim()} style={{ ...miniBtn, background: importText.trim() ? BRAND.ink : BRAND.grid, color: "#fff", border: "none" }}>Parse →</button>
                  <span style={{ fontSize: 11, color: BRAND.muted }}>or</span>
                  <label style={{ ...miniBtn, cursor: "pointer", display: "inline-flex", background: "#fff", color: BRAND.ink, border: `1px solid ${BRAND.grid}` }}>
                    Upload CSV / Excel
                    <input type="file" accept=".csv,.tsv,.xlsx,.xls,text/csv" onChange={onDataFile} style={{ display: "none" }} />
                  </label>
                </div>
                {dataErr && <div style={{ marginTop: 8, fontSize: 12, color: "#B23B3B" }}>{dataErr}</div>}
              </div>
            ) : (
              <div style={{ marginTop: 10 }}>
                <div style={{ color: BRAND.muted, fontSize: 11, marginBottom: 6 }}>Detected {parsed.matrix.length} rows · {parsed.headers.length} columns. Confirm the mapping:</div>
                <div style={impRow}><span style={impLbl}>Label (x-axis)</span>
                  <select value={labelCol} onChange={(e) => setLabelCol(+e.target.value)} style={impSel}>
                    {parsed.headers.map((h, c) => <option key={c} value={c}>{h || `Col ${c + 1}`}</option>)}
                  </select></div>
                <div style={{ ...impRow, alignItems: "flex-start" }}><span style={impLbl}>Series</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, flex: 1 }}>
                    {parsed.headers.map((h, c) => c === labelCol ? null : (
                      <button key={c} onClick={() => toggleSeries(c)} style={{ padding: "4px 8px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: BRAND.fontBody,
                        border: `1px solid ${seriesCols.includes(c) ? BRAND.ink : BRAND.grid}`, background: seriesCols.includes(c) ? BRAND.ink : "transparent", color: seriesCols.includes(c) ? "#fff" : BRAND.ink }}>{h || `Col ${c + 1}`}</button>
                    ))}
                  </div></div>
                <div style={impRow}><span style={impLbl}>Unit</span>
                  <select value={impUnit} onChange={(e) => setImpUnit(e.target.value)} style={impSel}>
                    <option value="">none</option><option value="$M">$M</option><option value="%">%</option><option value="x">x</option>
                  </select></div>
                <button onClick={buildFromImport} style={{ ...miniBtn, background: BRAND.accent, color: "#fff", border: "none", marginTop: 8 }}>Build chart →</button>
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <Field label="Source" value={draft.source} onChange={(v) => patch({ source: v })} />
            </div>
          </>
        )}

        {createMode === "image" && (
          <>
            <div style={{ fontSize: 12, color: BRAND.muted, marginBottom: 10, lineHeight: 1.5 }}>Upload a chart image and I&#39;ll read the data off it. Best for third-party charts with no export. Always verify against the source — read values are estimates.</div>
            <label style={{ display: "block", border: `1px dashed ${BRAND.grid}`, borderRadius: 8, padding: imgSrc ? 8 : 24, textAlign: "center", cursor: "pointer", background: "#fff" }}>
              <input type="file" accept="image/*" onChange={handleImageFile} style={{ display: "none" }} />
              {imgSrc
                ? <img src={imgSrc} alt="chart to read" style={{ maxWidth: "100%", maxHeight: 170, borderRadius: 4 }} />
                : <span style={{ fontSize: 13, color: BRAND.muted }}>Choose a chart image…</span>}
            </label>
            {imgSrc && <button onClick={extractFromImage} disabled={imgBusy} style={{ ...actionBtn(BRAND.accent), width: "100%", justifyContent: "center", marginTop: 10 }}>{imgBusy ? <Spinner label="Reading the chart…" /> : "Extract data →"}</button>}
            {imgErr && <div style={{ fontSize: 12, color: BRAND.accent, marginTop: 8, lineHeight: 1.5 }}>{imgErr}</div>}
            <div style={{ fontSize: 11, color: BRAND.muted, marginTop: 10, lineHeight: 1.5 }}>Extracted data lands in Review flagged to verify, where you can correct any cell.</div>
            <div style={{ marginTop: 12 }}>
              <Field label="Source" value={draft.source} onChange={(v) => patch({ source: v })} />
            </div>
          </>
        )}

        {createMode === "blank" && (
          <>
            {!blankChose ? (
              <>
                <div style={{ fontSize: 12, color: BRAND.muted, marginBottom: 12, lineHeight: 1.5 }}>What kind of chart?</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {ARCHE.map((a) => (
                    <button key={a.id} onClick={() => { patch({ archetype: a.id }); setBlankChose(true); }} style={{ textAlign: "left", padding: "12px 14px", borderRadius: 9, cursor: "pointer", fontFamily: BRAND.fontBody,
                      border: `1px solid ${BRAND.grid}`, background: "#fff", color: BRAND.ink }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{a.label}</div>
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{a.hint}</div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontSize: 12.5, color: BRAND.ink, fontWeight: 700 }}>{(ARCHE.find((a) => a.id === draft.archetype) || {}).label}</span>
                  <button onClick={() => setBlankChose(false)} style={miniBtn}>‹ Change type</button>
                </div>
                {framingFields()}
                <div style={{ marginTop: 14 }} />
                {dataEditor()}
              </>
            )}
          </>
        )}
      </>
    );
    if (id === "review") {
      return (
        <>
          <div style={panelTitle}>Review &amp; edit</div>
          <div style={{ fontSize: 12, color: BRAND.muted, marginBottom: 12, lineHeight: 1.5 }}>Everything that defines the chart — edit any field and the preview updates.</div>
          {draft.provenance ? (
            <div style={{ fontSize: 11.5, color: "#8a5a00", background: "#FBF3DF", border: "1px solid #EAD9A8", borderRadius: 7, padding: "7px 10px", marginBottom: 12, lineHeight: 1.45 }}>{draft.provenance}</div>
          ) : null}
          {framingFields()}
          <div style={{ marginTop: 14 }} />
          {dataEditor()}
        </>
      );
    }
    if (id === "publish") return (
      <>
        <div style={panelTitle}>Card palette</div>
        <div style={{ fontSize: 12, color: BRAND.muted, marginBottom: 10, lineHeight: 1.5 }}>Sets the background and chart colors — applied to the preview, the embed, and the PNG.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          {Object.entries(PALETTES).map(([pid, p]) => (
            <button key={pid} onClick={() => patch({ palette: pid })} style={{
              display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 9, cursor: "pointer",
              border: `1px solid ${(draft.palette || "cream") === pid ? BRAND.ink : BRAND.grid}`, background: "#fff", fontFamily: BRAND.fontBody }}>
              <span style={{ width: 48, height: 34, borderRadius: 6, background: p.paper, border: `1px solid ${BRAND.grid}`, position: "relative", flexShrink: 0 }}>
                <span style={{ position: "absolute", left: 6, top: 6, width: 24, height: 3, background: p.accent, borderRadius: 2 }} />
                <span style={{ position: "absolute", left: 6, bottom: 6, display: "flex", gap: 3 }}>
                  {p.series.slice(0, 3).map((c, i) => <span key={i} style={{ width: 6, height: 6, borderRadius: 3, background: c }} />)}
                </span>
              </span>
              <span style={{ textAlign: "left", flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: BRAND.ink }}>{p.name}</div>
                <div style={{ fontSize: 11, color: BRAND.muted }}>{pid === "white" ? "default" : pid === "cream" ? "off-white (brand)" : "dark background"}</div>
              </span>
              {(draft.palette || "cream") === pid && <span style={{ color: BRAND.accent, fontSize: 14 }}>●</span>}
            </button>
          ))}
        </div>
        {!framed && <div style={{ fontSize: 11.5, color: BRAND.accent, marginBottom: 10 }}>Heads up — add a takeaway headline and source in the Review step.</div>}
        <button onClick={saveDraft} style={{ ...actionBtn(BRAND.ink), width: "100%", justifyContent: "center" }}>{savedFlash ? "Saved ✓" : "Save to library"}</button>
        <div style={{ fontSize: 11, color: BRAND.muted, marginTop: 12, lineHeight: 1.5 }}>Edit the data later and the embed updates everywhere; a palette change re-renders the chart and its exports.</div>
      </>
    );
    return null;
  }

  function renderPublish() {
    const pal = palOf(draft);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 26, maxWidth: 700 }}>
        <div>
          <div style={{ marginBottom: 8 }}><span style={ctxLbl}>SITE — INTERACTIVE EMBED</span></div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 10 }}>
            <ChartEmbed chart={previewChart || draft} />
          </div>
          <button onClick={copyEmbed} style={{ ...actionBtn(BRAND.ink), marginTop: 10 }}>{copied ? "Copied ✓" : "Copy embed"}</button>
          <textarea ref={embedRef} readOnly value={embed} rows={4} onFocus={(e) => e.target.select()} style={{ ...taStyle, color: BRAND.muted, marginTop: 8 }} />
        </div>
        <div>
          <div style={{ marginBottom: 8 }}><span style={ctxLbl}>NEWSLETTER — STATIC PNG</span></div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24 }}>
            <CropFrame chart={previewChart || draft} />
          </div>
          <div style={{ fontSize: 12.5, color: BRAND.ink, marginTop: 10, lineHeight: 1.55 }}>Click and drag to select just the chart within the crop marks. <strong>⌘ + Shift + 4</strong> on Mac, <strong>⊞ Win + Shift + S</strong> on Windows.</div>
          <button disabled title="Not available in this preview build" style={{ ...actionBtn(BRAND.accent), marginTop: 10, opacity: 0.4, cursor: "not-allowed" }}>Download PNG</button>
          <div style={{ fontSize: 11.5, color: BRAND.muted, marginTop: 8, lineHeight: 1.5 }}>Flat image for the Data Dose email — JS &amp; iframes get stripped in mail clients. Direct download isn&#39;t available in this preview build; use the screen capture above.</div>
        </div>
      </div>
    );
  }
}

/* ---- small UI atoms ---- */
const miniBtn = { padding: "5px 10px", borderRadius: 6, border: `1px solid ${BRAND.grid}`, background: "#fff", cursor: "pointer", fontSize: 12, fontFamily: BRAND.fontBody, color: BRAND.ink };
const actionBtn = (bg) => ({
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "8px 13px", borderRadius: 7, border: "none", cursor: "pointer",
  fontSize: 12.5, fontWeight: 600, fontFamily: BRAND.fontBody, color: "#fff", background: bg,
});
const cellHead = { padding: "7px 9px" };
const impRow = { display: "flex", alignItems: "center", gap: 8, margin: "7px 0" };
const impLbl = { width: 92, fontSize: 11, color: BRAND.muted, flexShrink: 0 };
const impSel = { flex: 1, padding: "5px 6px", borderRadius: 6, border: `1px solid ${BRAND.grid}`, fontSize: 12.5, fontFamily: BRAND.fontBody, background: "#fff", color: BRAND.ink };
const cellInput = { border: "none", padding: "7px 9px", fontSize: 13, fontFamily: BRAND.fontBody, width: "100%", boxSizing: "border-box", background: "transparent", outline: "none" };

function Field({ label, value, onChange }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", color: BRAND.muted, marginBottom: 4 }}>{label.toUpperCase()}</div>
      <input value={value || ""} onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${BRAND.grid}`, fontSize: 13, fontFamily: BRAND.fontBody, boxSizing: "border-box", background: "#fff", color: BRAND.ink }} />
    </div>
  );
}
