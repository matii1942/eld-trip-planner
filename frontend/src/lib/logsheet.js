/**
 * Draws a Driver's Daily Log (record of duty status) as SVG, reproducing the
 * standard DOT paper form required by 49 CFR 395.8.
 *
 * Kept framework-free and string-returning on purpose: the exact same
 * function backs the on-screen sheet, the PNG/PDF export and the print
 * stylesheet, so there is only ever one drawing to keep correct.
 */

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
export const SHEET_W = 1100;
export const SHEET_H = 830;

const M = 26; // outer margin
const GRID_L = 158; // left edge of the 24-hour grid
const GRID_R = 990; // right edge of the grid
const GRID_W = GRID_R - GRID_L; // 832px across 24 hours
const TOTAL_R = SHEET_W - M; // right edge of the "Total Hours" column
const ROW_H = 33;
const HDR_H = 20;
const GRID_TOP = 302;
const GRID_BOTTOM = GRID_TOP + HDR_H + ROW_H * 4;

const ROWS = [
  { key: "OFF", n: "1.", label: "Off Duty" },
  { key: "SB", n: "2.", label: "Sleeper Berth" },
  { key: "D", n: "3.", label: "Driving" },
  { key: "ON", n: "4.", label: "On Duty (not driving)" },
];

const ROW_INDEX = { OFF: 0, SB: 1, D: 2, ON: 3 };

const INK = "#111827";
const RULE = "#374151";
const FAINT = "#9ca3af";
const LINE = "#1d4ed8"; // the drawn duty line
const LINE_W = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const xAt = (min) => GRID_L + (Math.max(0, Math.min(1440, min)) / 1440) * GRID_W;
const rowY = (key) => GRID_TOP + HDR_H + ROW_INDEX[key] * ROW_H;
const rowMid = (key) => rowY(key) + ROW_H / 2;

const hhmm = (h) => {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${hh}:${String(mm).padStart(2, "0")}`;
};

const minToClock = (min) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const fmtDate = (iso) => {
  const [y, m, d] = String(iso).split("-");
  return { y, m, d };
};

const text = (x, y, s, opts = {}) => {
  const {
    size = 10,
    weight = 400,
    anchor = "start",
    fill = INK,
    family = "'Helvetica Neue', Arial, sans-serif",
    letter = 0,
    transform = "",
  } = opts;
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}"${
    letter ? ` letter-spacing="${letter}"` : ""
  }${transform ? ` transform="${transform}"` : ""}>${esc(s)}</text>`;
};

const rect = (x, y, w, h, opts = {}) => {
  const { stroke = RULE, fill = "none", sw = 1 } = opts;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
};

const line = (x1, y1, x2, y2, opts = {}) => {
  const { stroke = RULE, sw = 1, dash = "" } = opts;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"${
    dash ? ` stroke-dasharray="${dash}"` : ""
  }/>`;
};

/** A labelled box with a rule under the caption, as on the paper form. */
const fieldBox = (x, y, w, h, caption, value, opts = {}) => {
  const { valueSize = 11, captionBelow = true } = opts;
  let out = rect(x, y, w, h);
  if (captionBelow) {
    out += text(x + w / 2, y + h + 11, caption, {
      size: 7.5,
      anchor: "middle",
      fill: "#4b5563",
    });
  }
  if (value) {
    out += text(x + w / 2, y + h / 2 + 4, value, {
      size: valueSize,
      anchor: "middle",
      weight: 600,
    });
  }
  return out;
};

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------
function header(day, meta) {
  const { y, m, d } = fmtDate(day.date);
  let s = "";

  s += text(M, M + 20, "Driver's Daily Log", { size: 21, weight: 700 });
  s += text(M, M + 34, "(24 hours)", { size: 9, fill: "#4b5563" });

  // date fields -------------------------------------------------------
  const dx = 300;
  const dy = M + 22;
  const cell = (x, w, val, cap) => {
    let o = line(x, dy, x + w, dy, { sw: 1 });
    o += text(x + w / 2, dy - 4, val, { size: 13, anchor: "middle", weight: 600 });
    o += text(x + w / 2, dy + 12, cap, { size: 7.5, anchor: "middle", fill: "#4b5563" });
    return o;
  };
  s += cell(dx, 54, m, "(month)");
  s += text(dx + 58, dy - 2, "/", { size: 13, fill: FAINT });
  s += cell(dx + 66, 44, d, "(day)");
  s += text(dx + 114, dy - 2, "/", { size: 13, fill: FAINT });
  s += cell(dx + 122, 62, y, "(year)");

  s += text(
    SHEET_W - M,
    M + 8,
    "Original — File at home terminal.",
    { size: 7.5, anchor: "end", fill: "#4b5563" }
  );
  s += text(
    SHEET_W - M,
    M + 20,
    "Duplicate — Driver retains in his/her possession for 8 days.",
    { size: 7.5, anchor: "end", fill: "#4b5563" }
  );

  // From / To ---------------------------------------------------------
  const fy = M + 66;
  s += text(M, fy, "From:", { size: 9.5, weight: 600 });
  s += line(M + 34, fy + 3, 520, fy + 3);
  s += text(M + 40, fy, day.from_label || meta.from_label || "", { size: 10 });

  s += text(548, fy, "To:", { size: 9.5, weight: 600 });
  s += line(568, fy + 3, SHEET_W - M, fy + 3);
  s += text(574, fy, day.to_label || meta.to_label || "", { size: 10 });

  // Mileage + carrier boxes -------------------------------------------
  const by = M + 84;
  const bh = 34;
  s += fieldBox(M, by, 150, bh, "Total Miles Driving Today", String(day.miles_driving ?? 0));
  s += fieldBox(M + 166, by, 150, bh, "Total Mileage Today", String(day.miles_driving ?? 0));
  s += fieldBox(M + 336, by, SHEET_W - M - (M + 336), bh, "Name of Carrier or Carriers", meta.carrier_name || "");

  const by2 = by + bh + 26;
  s += fieldBox(M, by2, 316, bh, "Truck/Tractor and Trailer Numbers or License Plate(s)/State (show each unit)", meta.truck_number || "");
  s += fieldBox(M + 336, by2, SHEET_W - M - (M + 336), bh, "Main Office Address", meta.main_office || "");

  const by3 = by2 + bh + 26;
  s += fieldBox(M, by3, 316, bh, "Driver's Signature / Name", meta.driver_name || "");
  s += fieldBox(M + 336, by3, SHEET_W - M - (M + 336), bh, "Home Terminal Address", meta.home_terminal || "");

  return s;
}

function grid() {
  let s = "";

  // dark hour-label bar ------------------------------------------------
  s += `<rect x="${GRID_L}" y="${GRID_TOP}" width="${GRID_W}" height="${HDR_H}" fill="#1f2937"/>`;
  s += rect(GRID_L, GRID_TOP, GRID_W, HDR_H + ROW_H * 4, { sw: 1.4 });

  const labels = [
    "Mid-\nnight", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11",
    "Noon", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11",
  ];
  for (let h = 0; h < 24; h++) {
    const cx = xAt(h * 60 + 30);
    const label = labels[h];
    if (label.includes("\n")) {
      s += text(cx, GRID_TOP + 9, "Mid-", { size: 6.8, anchor: "middle", fill: "#fff" });
      s += text(cx, GRID_TOP + 16.5, "night", { size: 6.8, anchor: "middle", fill: "#fff" });
    } else {
      s += text(cx, GRID_TOP + 14, label, {
        size: label === "Noon" ? 7.5 : 8.5,
        anchor: "middle",
        fill: "#fff",
        weight: 600,
      });
    }
  }
  // trailing midnight label
  s += text(GRID_R + 4, GRID_TOP + 9, "Mid-", { size: 6.8, fill: INK });
  s += text(GRID_R + 4, GRID_TOP + 16.5, "night", { size: 6.8, fill: INK });

  // "Total Hours" column ------------------------------------------------
  s += rect(GRID_R + 42, GRID_TOP, TOTAL_R - (GRID_R + 42), HDR_H + ROW_H * 4, { sw: 1.4 });
  s += text(GRID_R + 42 + (TOTAL_R - GRID_R - 42) / 2, GRID_TOP + 13, "Total", {
    size: 7.5, anchor: "middle", weight: 600,
  });
  s += line(GRID_R + 42, GRID_TOP + HDR_H, TOTAL_R, GRID_TOP + HDR_H);

  // row labels and horizontal rules -------------------------------------
  ROWS.forEach((r, i) => {
    const y = GRID_TOP + HDR_H + i * ROW_H;
    s += text(M, y + ROW_H / 2 + 3.5, r.n, { size: 9, weight: 700 });
    s += text(M + 16, y + ROW_H / 2 + 3.5, r.label, { size: 9 });
    if (i > 0) s += line(GRID_L, y, GRID_R, y, { sw: 1 });
    // stripe the driving row very faintly so the eye finds it
    if (r.key === "D") {
      s += `<rect x="${GRID_L}" y="${y}" width="${GRID_W}" height="${ROW_H}" fill="#1d4ed8" opacity="0.035"/>`;
    }
  });

  // vertical hour + quarter-hour ticks -----------------------------------
  for (let h = 0; h <= 24; h++) {
    const x = xAt(h * 60);
    s += line(x, GRID_TOP + HDR_H, x, GRID_BOTTOM, { sw: h % 6 === 0 ? 1.3 : 0.9, stroke: RULE });
    if (h === 24) break;
    for (let q = 1; q < 4; q++) {
      const qx = xAt(h * 60 + q * 15);
      // quarter ticks hang from the top and rise from the bottom of each row,
      // exactly as on the printed form
      ROWS.forEach((_, i) => {
        const ry = GRID_TOP + HDR_H + i * ROW_H;
        const len = q === 2 ? ROW_H * 0.42 : ROW_H * 0.26;
        s += line(qx, ry, qx, ry + len, { sw: 0.6, stroke: FAINT });
        s += line(qx, ry + ROW_H, qx, ry + ROW_H - len, { sw: 0.6, stroke: FAINT });
      });
    }
  }

  return s;
}

function dutyLine(day) {
  const entries = [...(day.entries || [])].sort((a, b) => a.start_min - b.start_min);
  if (!entries.length) return "";

  let path = "";
  let prev = null;
  const pts = [];

  entries.forEach((e) => {
    const y = rowMid(e.status);
    const x1 = xAt(e.start_min);
    const x2 = xAt(e.end_min);
    if (prev !== null && Math.abs(prev.y - y) > 0.5) {
      // vertical connector at the moment of the status change
      pts.push(`L ${x1.toFixed(2)} ${y.toFixed(2)}`);
    } else if (prev === null) {
      pts.push(`M ${x1.toFixed(2)} ${y.toFixed(2)}`);
    }
    pts.push(`L ${x2.toFixed(2)} ${y.toFixed(2)}`);
    prev = { y, x: x2 };
  });

  path = `<path d="${pts.join(" ")}" fill="none" stroke="${LINE}" stroke-width="${LINE_W}" stroke-linejoin="miter" stroke-linecap="butt"/>`;

  // small square markers at each status change, as drivers pencil in
  let marks = "";
  entries.forEach((e, i) => {
    if (i === 0) return;
    const x = xAt(e.start_min);
    const y = rowMid(e.status);
    marks += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.4" fill="${LINE}"/>`;
  });

  return path + marks;
}

function totalsColumn(day) {
  let s = "";
  const cx = GRID_R + 42 + (TOTAL_R - GRID_R - 42) / 2;
  ROWS.forEach((r, i) => {
    const y = GRID_TOP + HDR_H + i * ROW_H;
    if (i > 0) s += line(GRID_R + 42, y, TOTAL_R, y);
    const v = day.totals?.[r.key] ?? 0;
    s += text(cx, y + ROW_H / 2 + 4, hhmm(v), {
      size: 10,
      anchor: "middle",
      weight: v > 0 ? 700 : 400,
      fill: v > 0 ? INK : FAINT,
    });
  });
  // grand total under the column
  s += text(cx, GRID_BOTTOM + 14, hhmm(day.total_hours ?? 24), {
    size: 10, anchor: "middle", weight: 700,
  });
  s += line(GRID_R + 42, GRID_BOTTOM + 3, TOTAL_R, GRID_BOTTOM + 3, { sw: 1.4 });
  return s;
}

function remarks(day) {
  const top = GRID_BOTTOM + 24;
  const h = 108;
  let s = "";

  s += text(M, top + 11, "Remarks", { size: 10, weight: 700 });
  s += rect(GRID_L, top, TOTAL_R - GRID_L, h);

  // tick marks along the top of the remarks box line up with the grid hours,
  // so a remark sits under the hour it happened
  for (let hh = 0; hh <= 24; hh++) {
    const x = xAt(hh * 60);
    if (x >= GRID_L && x <= GRID_R) {
      s += line(x, top, x, top + 5, { sw: 0.7, stroke: FAINT });
    }
  }

  const items = (day.remarks || []).filter((r) => r.text && r.text !== "Off duty");
  // stagger labels across three rows so they do not collide
  items.slice(0, 18).forEach((r, i) => {
    const x = Math.min(Math.max(xAt(r.start_min), GRID_L + 2), GRID_R - 4);
    const lane = i % 3;
    const y = top + 20 + lane * 30;
    s += line(x, top + 5, x, y - 9, { sw: 0.7, stroke: "#93c5fd" });
    s += `<circle cx="${x}" cy="${top + 5}" r="1.8" fill="${LINE}"/>`;
    s += text(x + 3, y, `${minToClock(r.start_min)} ${r.text}`, { size: 7.2, fill: "#1f2937" });
    if (r.location) {
      s += text(x + 3, y + 8.5, r.location, { size: 6.6, fill: "#6b7280" });
    }
  });

  s += text(
    (GRID_L + TOTAL_R) / 2,
    top + h + 11,
    "Enter name of place you reported and where released from work and when and where each change of duty occurred.",
    { size: 7, anchor: "middle", fill: "#4b5563" }
  );
  s += text((GRID_L + TOTAL_R) / 2, top + h + 20, "Use time standard of home terminal.", {
    size: 7, anchor: "middle", fill: "#4b5563", weight: 600,
  });

  // shipping documents block (left of remarks)
  s += text(M, top + 34, "Shipping", { size: 7.5, weight: 600 });
  s += text(M, top + 43, "Documents:", { size: 7.5, weight: 600 });
  s += line(M, top + 62, GRID_L - 10, top + 62, { sw: 0.8 });
  s += text(M, top + 60, "DVL or Manifest No.", { size: 6.6, fill: "#6b7280" });
  s += line(M, top + 84, GRID_L - 10, top + 84, { sw: 0.8 });
  s += text(M, top + 82, "Shipper & Commodity", { size: 6.6, fill: "#6b7280" });

  return { svg: s, bottom: top + h + 26 };
}

function recapBlock(day, top) {
  const rec = day.recap || {};
  let s = "";
  const h = 76;
  s += rect(M, top, TOTAL_R - M, h);

  s += text(M + 8, top + 16, "Recap:", { size: 8.5, weight: 700 });
  s += text(M + 8, top + 27, "Complete at", { size: 7, fill: "#4b5563" });
  s += text(M + 8, top + 36, "end of day", { size: 7, fill: "#4b5563" });

  const col = (x, w, title, rows) => {
    let o = line(x, top, x, top + h, { sw: 1 });
    o += text(x + w / 2, top + 14, title, { size: 8, anchor: "middle", weight: 700 });
    o += line(x, top + 19, x + w, top + 19, { sw: 0.8 });
    rows.forEach((r, i) => {
      const cw = w / rows.length;
      const cx = x + i * cw;
      if (i > 0) o += line(cx, top + 19, cx, top + h, { sw: 0.7, stroke: FAINT });
      o += text(cx + 5, top + 31, r.k, { size: 7, weight: 700 });
      o += text(cx + 5, top + 41, r.c1, { size: 6.4, fill: "#4b5563" });
      o += text(cx + 5, top + 49, r.c2, { size: 6.4, fill: "#4b5563" });
      o += text(cx + cw / 2, top + 68, r.v, { size: 12, anchor: "middle", weight: 700 });
    });
    return o;
  };

  // On-duty hours today
  s += line(120, top, 120, top + h, { sw: 1 });
  s += text(126, top + 31, "On duty hours today,", { size: 6.6, fill: "#4b5563" });
  s += text(126, top + 40, "Total lines 3 & 4", { size: 6.6, fill: "#4b5563" });
  s += text(163, top + 62, hhmm(rec.on_duty_today ?? 0), {
    size: 13, anchor: "middle", weight: 700,
  });

  const c70x = 215;
  const c70w = 400;
  s += col(c70x, c70w, "70 Hour / 8 Day Drivers", [
    { k: "A.", c1: "Total hours on", c2: "duty last 7 days", v: hhmm(rec.cycle_used ?? 0) },
    { k: "B.", c1: "Total hours available", c2: "tomorrow (70 − A)", v: hhmm(rec.available_tomorrow ?? 0) },
    { k: "C.", c1: "Total hours on duty", c2: "last 5 days", v: "—" },
  ]);

  const c60x = c70x + c70w;
  const c60w = TOTAL_R - c60x;
  s += col(c60x, c60w, "60 Hour / 7 Day Drivers", [
    { k: "A.", c1: "Total hours on", c2: "duty last 6 days", v: "—" },
    { k: "B.", c1: "Total hours available", c2: "tomorrow (60 − A)", v: "—" },
    { k: "C.", c1: "Total hours on duty", c2: "last 4 days", v: "—" },
  ]);

  return s;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function renderLogSheet(day, meta = {}) {
  const rem = remarks(day);
  const body = [
    `<rect x="0" y="0" width="${SHEET_W}" height="${SHEET_H}" fill="#ffffff"/>`,
    header(day, meta),
    grid(),
    dutyLine(day),
    totalsColumn(day),
    rem.svg,
    recapBlock(day, rem.bottom),
    text(
      M,
      SHEET_H - 8,
      `Day ${day.day_number} of trip — generated by ELD Trip Planner. Not a substitute for a certified ELD record.`,
      { size: 6.5, fill: "#9ca3af" }
    ),
  ].join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHEET_W} ${SHEET_H}" width="100%" role="img" aria-label="Driver's daily log for ${esc(day.date)}">${body}</svg>`;
}

export function logSheetHTML(day, meta) {
  return `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#e5e7eb;padding:20px">${renderLogSheet(
    day,
    meta
  )}</body>`;
}
