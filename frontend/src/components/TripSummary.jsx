import { STOP_STYLE, dateTime, hours, miles } from "../lib/format";

function Stat({ k, v, unit, d }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">
        {v}
        {unit && <small>{unit}</small>}
      </div>
      {d && <div className="d">{d}</div>}
    </div>
  );
}

export default function TripSummary({ plan }) {
  const s = plan.summary;
  const cyclePct = (s.cycle_used_at_end / s.cycle_limit) * 100;

  return (
    <div className="card">
      <div className="card-head">
        <h2>Trip summary</h2>
        <div style={{ flex: 1 }} />
        {plan.compliant ? (
          <span className="badge badge-ok">
            <span className="dot" /> HOS compliant
          </span>
        ) : (
          <span className="badge badge-bad">
            <span className="dot" /> {plan.violations.length} violation
            {plan.violations.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {!plan.compliant && (
        <div style={{ padding: "12px 16px 0" }}>
          {plan.violations.map((v, i) => (
            <div className="alert alert-error" key={i}>
              <span>⚠</span>
              <span>
                <b>{v.rule}</b> — {v.detail}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="stats">
        <Stat k="Distance" v={miles(s.total_miles)} unit="mi" d={`${miles(plan.legs.to_pickup_miles)} + ${miles(plan.legs.to_dropoff_miles)} mi`} />
        <Stat k="Driving time" v={hours(s.total_driving_hours)} d={`@ ${s.average_speed_mph} mph avg`} />
        <Stat k="On duty" v={hours(s.total_on_duty_hours)} d="lines 3 + 4" />
        <Stat k="Total trip" v={hours(s.total_elapsed_hours)} d={`${s.days_required} log sheet${s.days_required > 1 ? "s" : ""}`} />
        <Stat
          k="Cycle after"
          v={s.cycle_used_at_end.toFixed(1)}
          unit={`/ ${s.cycle_limit}`}
          d={`${cyclePct.toFixed(0)}% of 70 hr / 8 day`}
        />
        <Stat
          k="Required stops"
          v={s.rest_stops + s.fuel_stops + s.restarts}
          d={`${s.rest_stops} rest · ${s.fuel_stops} fuel${s.restarts ? ` · ${s.restarts} restart` : ""}`}
        />
      </div>

      <div className="stops">
        {plan.stops.map((st, i) => {
          const style = STOP_STYLE[st.kind] || STOP_STYLE.break;
          return (
            <div className="stop" key={i}>
              <span className="ic" style={{ background: style.bg, color: style.color }}>
                {style.icon}
              </span>
              <span>
                <div className="t">{st.label}</div>
                <div className="s">
                  {st.location} · mile {miles(st.odometer)}
                </div>
              </span>
              <span className="r">
                <b>{dateTime(st.arrive)}</b>
                {st.hours > 0 && hours(st.hours)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
