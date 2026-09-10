import { useMemo, useState } from "react";

import { renderLogSheet, SHEET_H, SHEET_W } from "../lib/logsheet";
import { dayLabel, hours } from "../lib/format";

/** Rasterise the SVG in-browser so the driver can save a PNG of the sheet. */
async function downloadPNG(svgMarkup, filename) {
  const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = SHEET_W * scale;
    canvas.height = SHEET_H * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = filename;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function LogSheets({ plan }) {
  const days = plan?.days || [];
  const [active, setActive] = useState(0);

  const meta = useMemo(
    () => ({
      ...(plan?.meta || {}),
      main_office: plan?.meta?.main_office || "",
      home_terminal: plan?.meta?.home_terminal || plan?.places?.origin?.name || "",
    }),
    [plan]
  );

  const day = days[Math.min(active, days.length - 1)];
  const svg = useMemo(() => (day ? renderLogSheet(day, meta) : ""), [day, meta]);

  if (!day) return null;

  return (
    <div className="card">
      <div className="card-head">
        <h2>Daily log sheets</h2>
        <span className="hint">
          {days.length} sheet{days.length > 1 ? "s" : ""} · 49 CFR 395.8
        </span>
        <div style={{ flex: 1 }} />
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => downloadPNG(svg, `daily-log-${day.date}.png`)}
        >
          ↓ PNG
        </button>
        <button className="btn btn-ghost" type="button" onClick={() => window.print()}>
          ⎙ Print all
        </button>
      </div>

      <div style={{ padding: "12px 16px 0" }}>
        <div className="sheet-nav" role="tablist">
          {days.map((d, i) => (
            <button
              key={d.date}
              role="tab"
              type="button"
              className="sheet-tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
            >
              Day {d.day_number}
              <span className="d">{dayLabel(d.date)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="day-strip">
        <span className="day-pill">Driving <b>{hours(day.totals.D)}</b></span>
        <span className="day-pill">On duty <b>{hours(day.totals.ON)}</b></span>
        <span className="day-pill">Sleeper <b>{hours(day.totals.SB)}</b></span>
        <span className="day-pill">Off duty <b>{hours(day.totals.OFF)}</b></span>
        <span className="day-pill">Miles <b>{Math.round(day.miles_driving).toLocaleString()}</b></span>
        {day.recap && (
          <span className="day-pill">
            Cycle used <b>{day.recap.cycle_used.toFixed(1)} / 70 h</b>
          </span>
        )}
      </div>

      <div className="sheet-scroll">
        {/* One sheet on screen; every sheet is emitted for printing. */}
        <div className="sheet-paper screen-only" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="print-only">
          {days.map((d) => (
            <div
              key={d.date}
              className="sheet-paper"
              dangerouslySetInnerHTML={{ __html: renderLogSheet(d, meta) }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
