import { describe, expect, it } from "vitest";

import { renderLogSheet, SHEET_H, SHEET_W, logSheetHTML } from "./logsheet.js";

// Grid geometry, mirrored from logsheet.js. If the drawing moves, these
// numbers must move with it -- which is the point: the tests pin the layout.
const GRID_LEFT = 158;
const GRID_RIGHT = 990;
const ROW_Y = { OFF: 338.5, SB: 371.5, D: 404.5, ON: 437.5 };

/** One legal day: 11 hours driving, a 30-minute break, totals to 24:00. */
const DAY = {
  day_number: 1,
  date: "2026-09-11",
  from_label: "Denver, CO",
  to_label: "Kansas City, MO",
  miles_driving: 605,
  total_hours: 24,
  totals: { OFF: 6.5, SB: 5.25, D: 11, ON: 1.25 },
  recap: { on_duty_today: 12.25, cycle_used: 26.25, available_tomorrow: 43.75 },
  // The API derives `remarks` from the entries: every duty change except
  // driving and the off-duty padding used to complete the 24 hours.
  remarks: [
    { start_min: 360, text: "Pre-trip inspection", location: "Denver, CO" },
    { start_min: 855, text: "30-minute rest break (8 hrs driving)", location: "Mile 440 en route" },
    { start_min: 1065, text: "Loading at Kansas City, MO", location: "Kansas City, MO" },
    { start_min: 1125, text: "10-hour reset (11-hour driving limit reached)", location: "Kansas City, MO" },
  ],
  entries: [
    { status: "OFF", start_min: 0, end_min: 360, label: "Off duty", location: "", miles: 0 },
    { status: "ON", start_min: 360, end_min: 375, label: "Pre-trip inspection", location: "Denver, CO", miles: 0 },
    { status: "D", start_min: 375, end_min: 855, label: "Driving to Kansas City, MO", location: "Denver, CO", miles: 440 },
    { status: "OFF", start_min: 855, end_min: 885, label: "30-minute rest break (8 hrs driving)", location: "Mile 440 en route", miles: 0 },
    { status: "D", start_min: 885, end_min: 1065, label: "Driving to Kansas City, MO", location: "Mile 440 en route", miles: 165 },
    { status: "ON", start_min: 1065, end_min: 1125, label: "Loading at Kansas City, MO", location: "Kansas City, MO", miles: 0 },
    { status: "SB", start_min: 1125, end_min: 1440, label: "10-hour reset (11-hour driving limit reached)", location: "Kansas City, MO", miles: 0 },
  ],
};

const META = {
  carrier_name: "Summit Freight Lines",
  driver_name: "M. Ariel",
  truck_number: "TRK-4417",
};

/** Pull the drawn duty line out of the SVG as a list of points. */
function dutyLinePoints(svg) {
  const match = svg.match(/<path d="([^"]+)" fill="none" stroke="#1d4ed8"/);
  if (!match) return [];
  return [...match[1].matchAll(/([ML]) ([\d.]+) ([\d.]+)/g)].map((m) => ({
    cmd: m[1],
    x: Number(m[2]),
    y: Number(m[3]),
  }));
}

describe("renderLogSheet", () => {
  const svg = renderLogSheet(DAY, META);

  it("produces an SVG sized to the sheet", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${SHEET_W} ${SHEET_H}"`);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("draws all four duty rows of the DOT form", () => {
    for (const label of ["Off Duty", "Sleeper Berth", "Driving", "On Duty (not driving)"]) {
      expect(svg).toContain(label);
    }
  });

  it("fills the header from the day and the meta", () => {
    expect(svg).toContain("Daily Log");
    expect(svg).toContain("Summit Freight Lines");
    expect(svg).toContain("TRK-4417");
    expect(svg).toContain("Denver, CO");
    expect(svg).toContain("09"); // month
    expect(svg).toContain("2026"); // year
  });

  it("shows each duty total in the Total Hours column", () => {
    expect(svg).toContain(">6:30<"); // off duty
    expect(svg).toContain(">5:15<"); // sleeper berth
    expect(svg).toContain(">11:00<"); // driving
    expect(svg).toContain(">1:15<"); // on duty
  });

  it("shows a grand total of 24 hours", () => {
    // A record of duty status must account for all 24 hours -- Sec. 395.8(f).
    expect(svg).toContain(">24:00<");
  });
});

describe("the drawn duty line", () => {
  const points = dutyLinePoints(renderLogSheet(DAY, META));

  it("exists and starts with a move command", () => {
    expect(points.length).toBeGreaterThan(0);
    expect(points[0].cmd).toBe("M");
  });

  it("spans the full 24 hours, edge to edge", () => {
    expect(points[0].x).toBe(GRID_LEFT);
    expect(points.at(-1).x).toBe(GRID_RIGHT);
  });

  it("never escapes the grid horizontally", () => {
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(GRID_LEFT);
      expect(p.x).toBeLessThanOrEqual(GRID_RIGHT);
    }
  });

  it("only ever sits on one of the four row centre lines", () => {
    const allowed = Object.values(ROW_Y);
    for (const p of points) {
      expect(allowed).toContain(p.y);
    }
  });

  it("puts each segment on the row its status belongs to", () => {
    // The 8-hour driving block must be drawn on the Driving row.
    const drivingPoints = points.filter((p) => p.y === ROW_Y.D);
    expect(drivingPoints.length).toBeGreaterThan(0);
    // And the day opens off duty, so the first point is on the Off Duty row.
    expect(points[0].y).toBe(ROW_Y.OFF);
    // It ends in the sleeper berth.
    expect(points.at(-1).y).toBe(ROW_Y.SB);
  });

  it("moves in time only -- x never goes backwards", () => {
    for (let i = 1; i < points.length; i++) {
      expect(points[i].x).toBeGreaterThanOrEqual(points[i - 1].x);
    }
  });
});

describe("remarks", () => {
  const svg = renderLogSheet(DAY, META);

  it("notes each duty change with its time", () => {
    expect(svg).toContain("30-minute rest break");
    expect(svg).toContain("Loading at Kansas City, MO");
    expect(svg).toContain("14:15"); // the break, at minute 855
  });

  it("leaves the padding entries out", () => {
    // "Off duty" is the filler used to complete the 24 hours; it is not an
    // event and should not clutter the remarks line.
    const remarksCount = (svg.match(/Off duty/g) || []).length;
    expect(remarksCount).toBe(0);
  });
});

describe("escaping", () => {
  it("escapes characters that would break the SVG", () => {
    const svg = renderLogSheet(DAY, { carrier_name: 'Smith & Sons <freight> "co"' });
    expect(svg).toContain("Smith &amp; Sons &lt;freight&gt;");
    expect(svg).not.toContain("<freight>");
  });
});

describe("edge cases", () => {
  it("survives a day with no entries", () => {
    const empty = { ...DAY, entries: [], totals: { OFF: 0, SB: 0, D: 0, ON: 0 }, total_hours: 0 };
    expect(() => renderLogSheet(empty, META)).not.toThrow();
  });

  it("survives missing meta", () => {
    expect(() => renderLogSheet(DAY, {})).not.toThrow();
    expect(() => renderLogSheet(DAY)).not.toThrow();
  });

  it("wraps the sheet in a standalone HTML document", () => {
    const html = logSheetHTML(DAY, META);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<svg");
  });
});