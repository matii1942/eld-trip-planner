export const STATUS_COLOR = {
  OFF: "var(--off)",
  SB: "var(--sb)",
  D: "var(--drive)",
  ON: "var(--on)",
};

export const STATUS_NAME = {
  OFF: "Off Duty",
  SB: "Sleeper Berth",
  D: "Driving",
  ON: "On Duty",
};

export const STOP_STYLE = {
  start: { icon: "▶", color: "#0f172a", bg: "#e2e8f0" },
  pickup: { icon: "↓", color: "#065f46", bg: "#d1fae5" },
  dropoff: { icon: "⚑", color: "#7f1d1d", bg: "#fee2e2" },
  fuel: { icon: "⛽", color: "#78350f", bg: "#fef3c7" },
  break: { icon: "⏸", color: "#3730a3", bg: "#e0e7ff" },
  rest: { icon: "\u{1F319}", color: "#5b21b6", bg: "#ede9fe" },
  restart: { icon: "↻", color: "#0c4a6e", bg: "#e0f2fe" },
};

export function hours(h) {
  if (h == null) return "—";
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return mm ? `${hh}h ${mm}m` : `${hh}h`;
}

export function clock(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function dayLabel(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export function dateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export const miles = (m) => `${Math.round(m).toLocaleString()}`;
