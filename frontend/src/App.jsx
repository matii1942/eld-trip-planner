import { useEffect, useState } from "react";

import LogSheets from "./components/LogSheets.jsx";
import RouteMap from "./components/RouteMap.jsx";
import Timeline from "./components/Timeline.jsx";
import TripForm from "./components/TripForm.jsx";
import TripSummary from "./components/TripSummary.jsx";
import { getTrip, planTrip } from "./lib/api";

function Empty() {
  return (
    <div className="card">
      <div className="empty">
        <div className="big">🗺️</div>
        <h3>Plan a trip to see the route and logs</h3>
        <p>
          Enter your current location, pickup and dropoff, plus the hours you have
          already used in your 70-hour / 8-day cycle. The planner inserts every
          rest, break, fuel and restart the regulations require, then draws the
          daily log sheets for you.
        </p>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="card">
      <div className="card-body">
        <div className="skeleton" style={{ height: 90, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 420, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 200 }} />
      </div>
    </div>
  );
}

export default function App() {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Deep link support: /?trip=12 reopens a saved plan.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("trip");
    if (!id) return;
    setLoading(true);
    getTrip(id)
      .then(setPlan)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const submit = async (payload) => {
    setLoading(true);
    setError(null);
    try {
      const result = await planTrip(payload);
      setPlan(result);
      if (result.id) {
        const u = new URL(window.location.href);
        u.searchParams.set("trip", result.id);
        window.history.replaceState({}, "", u);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e.message);
      setPlan(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <span className="mark">🚚</span>
        <div>
          <h1>ELD Trip Planner</h1>
          <div className="sub">Route, rest stops & FMCSA daily logs</div>
        </div>
        <div className="spacer" />
        <span className="reg">49 CFR 395 · 70 hr / 8 day</span>
      </header>

      <main className="shell">
        <TripForm onSubmit={submit} loading={loading} />

        <div style={{ display: "grid", gap: 22, minWidth: 0 }}>
          {error && (
            <div className="alert alert-error" style={{ marginBottom: 0 }}>
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}

          {loading && <Loading />}

          {!loading && !plan && !error && <Empty />}

          {!loading && plan && (
            <>
              <TripSummary plan={plan} />

              <div className="card">
                <div className="card-head">
                  <h2>Route & stops</h2>
                  <span className="hint">OpenStreetMap · OSRM routing</span>
                </div>
                <Timeline plan={plan} />
                <RouteMap plan={plan} />
              </div>

              <LogSheets plan={plan} />

              <div className="card">
                <div className="card-body rules-note">
                  <b>How this plan was built.</b> Driving time is planned at{" "}
                  <code>{plan.summary.average_speed_mph} mph</code> average. The engine enforces the
                  11-hour driving limit, the 14-hour driving window, a 30-minute
                  interruption after 8 cumulative driving hours, and the 70-hour / 8-day
                  on-duty limit, inserting 10-hour resets and a 34-hour restart where
                  required. Pickup and dropoff are 1 hour of on-duty time each, fueling is
                  a 30-minute on-duty stop at least every 1,000 miles, plus a 15-minute
                  pre-trip inspection and post-trip DVIR. Adverse driving conditions and the
                  sleeper-berth split are not applied.
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
