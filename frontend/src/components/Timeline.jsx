import { STATUS_COLOR, STATUS_NAME, clock, hours } from "../lib/format";

/**
 * A single continuous bar for the whole trip, coloured by duty status.
 * It is the fastest way to see that the plan alternates drive/rest legally.
 */
export default function Timeline({ plan }) {
  const segs = plan?.segments || [];
  if (!segs.length) return null;

  const total = segs.reduce((a, s) => a + s.hours, 0);
  const start = segs[0].start;
  const end = segs[segs.length - 1].end;

  return (
    <div className="tl">
      <div className="tl-bar" role="img" aria-label="Duty status over the whole trip">
        {segs.map((s, i) => (
          <div
            key={i}
            className="tl-seg"
            style={{ width: `${(s.hours / total) * 100}%`, background: STATUS_COLOR[s.status] }}
            title={`${STATUS_NAME[s.status]} · ${hours(s.hours)}\n${s.label}\n${clock(s.start)} → ${clock(s.end)}`}
          />
        ))}
      </div>
      <div className="tl-axis">
        <span>{new Date(start).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
        <span>{hours(total)} total</span>
        <span>{new Date(end).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
      </div>
      <div className="legend-row">
        {Object.keys(STATUS_NAME).map((k) => {
          const h = segs.filter((s) => s.status === k).reduce((a, s) => a + s.hours, 0);
          return (
            <span className="li" key={k}>
              <span className="sw" style={{ background: STATUS_COLOR[k] }} />
              {STATUS_NAME[k]} <b style={{ fontVariantNumeric: "tabular-nums" }}>{hours(h)}</b>
            </span>
          );
        })}
      </div>
    </div>
  );
}
