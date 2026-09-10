import { useEffect, useRef, useState } from "react";

import { searchPlaces } from "../lib/api";
import { searchCities } from "../lib/cities";

const EXAMPLES = [
  {
    name: "Denver → Atlanta",
    v: { current_location: "Denver, CO", pickup_location: "Kansas City, MO", dropoff_location: "Atlanta, GA", current_cycle_used: 14 },
  },
  {
    name: "Coast to coast",
    v: { current_location: "Los Angeles, CA", pickup_location: "Phoenix, AZ", dropoff_location: "Newark, NJ", current_cycle_used: 8 },
  },
  {
    name: "Short haul",
    v: { current_location: "Dallas, TX", pickup_location: "Fort Worth, TX", dropoff_location: "Houston, TX", current_cycle_used: 22 },
  },
  {
    name: "Near cycle limit",
    v: { current_location: "Chicago, IL", pickup_location: "Indianapolis, IN", dropoff_location: "Miami, FL", current_cycle_used: 64 },
  },
];

function LocationInput({ id, label, icon, value, onChange, placeholder }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef(null);
  const skip = useRef(false);

  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    const q = (value || "").trim();
    if (q.length < 2) {
      setItems([]);
      return;
    }

    // Local list first -- instant, and it keeps the public geocoders free of
    // per-keystroke traffic they explicitly ask you not to send.
    const local = searchCities(q).map((name) => ({ name, local: true }));
    setItems(local);
    setActive(-1);

    // Only reach for the network when the local list can't answer, and only
    // once the query is long enough to be meaningful.
    if (local.length >= 3 || q.length < 4) return;

    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const res = await searchPlaces(q, ctrl.signal);
      if (res.length) {
        setItems((prev) => {
          const seen = new Set(prev.map((p) => p.name));
          return [...prev, ...res.filter((p) => !seen.has(p.name))].slice(0, 8);
        });
      }
    }, 600);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);

  useEffect(() => {
    const away = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const pick = (name) => {
    skip.current = true;
    onChange(name);
    setOpen(false);
    setItems([]);
  };

  const onKey = (e) => {
    if (!open || !items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + items.length) % items.length);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(items[active].name);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="field" ref={box}>
      <label htmlFor={id}>
        {label} <span className="req">*</span>
      </label>
      <div className="input-icon">
        <span className="pin" aria-hidden="true">{icon}</span>
        <input
          id={id}
          className="input"
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
        />
      </div>
      {open && items.length > 0 && (
        <div className="suggestions" role="listbox">
          {items.map((p, i) => (
            <button
              key={`${p.lat}-${p.lon}-${i}`}
              type="button"
              data-active={i === active}
              onClick={() => pick(p.name)}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const localNow = () => {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
};

export default function TripForm({ onSubmit, loading }) {
  const [form, setForm] = useState({
    current_location: "",
    pickup_location: "",
    dropoff_location: "",
    current_cycle_used: 0,
    start_time: localNow(),
    driver_name: "",
    carrier_name: "",
    truck_number: "",
  });
  const [touched, setTouched] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const missing =
    !form.current_location.trim() ||
    !form.pickup_location.trim() ||
    !form.dropoff_location.trim();

  const cyclePct = (form.current_cycle_used / 70) * 100;
  const cycleColor =
    cyclePct > 90 ? "var(--danger)" : cyclePct > 70 ? "var(--warn)" : "var(--ok)";

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (missing || loading) return;
    onSubmit({
      ...form,
      current_cycle_used: Number(form.current_cycle_used),
      // Sent as local wall clock ("2026-09-10T15:00"), NOT toISOString().
      // A daily log is kept in the home terminal's time standard, so the hour
      // the driver picked is the hour that belongs on the grid -- converting
      // to UTC would shift every duty change by the browser's offset.
      start_time: form.start_time,
    });
  };

  return (
    <form className="card sticky-col" onSubmit={submit}>
      <div className="card-head">
        <h2>Trip details</h2>
        <span className="hint">Property-carrying · 70 hr / 8 day</span>
      </div>
      <div className="card-body">
        {touched && missing && (
          <div className="alert alert-error">
            <span>⚠</span>
            <span>Please fill in all three locations.</span>
          </div>
        )}

        <LocationInput
          id="cur"
          label="Current location"
          icon="🟢"
          value={form.current_location}
          onChange={set("current_location")}
          placeholder="City, State"
        />
        <LocationInput
          id="pick"
          label="Pickup location"
          icon="📦"
          value={form.pickup_location}
          onChange={set("pickup_location")}
          placeholder="City, State"
        />
        <LocationInput
          id="drop"
          label="Dropoff location"
          icon="🏁"
          value={form.dropoff_location}
          onChange={set("dropoff_location")}
          placeholder="City, State"
        />

        <div className="field">
          <label htmlFor="cycle">Current cycle used</label>
          <div className="slider-wrap">
            <input
              id="cycle"
              type="range"
              min="0"
              max="70"
              step="0.5"
              value={form.current_cycle_used}
              onChange={(e) => set("current_cycle_used")(e.target.value)}
            />
            <span className="cycle-badge" style={{ color: cycleColor }}>
              {Number(form.current_cycle_used).toFixed(1)} / 70 h
            </span>
          </div>
          <div className="cycle-bar">
            <span style={{ width: `${cyclePct}%`, background: cycleColor }} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="start">Start of duty</label>
          <input
            id="start"
            className="input"
            type="datetime-local"
            value={form.start_time}
            onChange={(e) => set("start_time")(e.target.value)}
          />
        </div>

        <details style={{ marginBottom: 14 }}>
          <summary style={{ fontSize: 12, color: "var(--ink-2)", cursor: "pointer", marginBottom: 10 }}>
            Log sheet header (optional)
          </summary>
          <div className="field">
            <label htmlFor="drv">Driver name</label>
            <input id="drv" className="input" value={form.driver_name}
              onChange={(e) => set("driver_name")(e.target.value)} placeholder="J. Smith" />
          </div>
          <div className="field">
            <label htmlFor="car">Carrier</label>
            <input id="car" className="input" value={form.carrier_name}
              onChange={(e) => set("carrier_name")(e.target.value)} placeholder="Acme Freight LLC" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="trk">Truck / trailer no.</label>
            <input id="trk" className="input" value={form.truck_number}
              onChange={(e) => set("truck_number")(e.target.value)} placeholder="TRK-101 / TRL-220" />
          </div>
        </details>

        <button className="btn" type="submit" disabled={loading}>
          {loading ? <><span className="spinner" /> Planning route…</> : <>Plan trip & draw logs</>}
        </button>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 6, fontWeight: 600 }}>
            TRY AN EXAMPLE
          </div>
          <div className="examples">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.name}
                type="button"
                className="chip"
                onClick={() => setForm((f) => ({ ...f, ...ex.v }))}
              >
                {ex.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </form>
  );
}
