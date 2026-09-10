# ELD Trip Planner

Takes trip details in, gives route instructions and drawn ELD daily logs out.

Enter a current location, pickup, dropoff and the hours already used in the
driver's 70-hour / 8-day cycle. The app routes the trip, inserts every rest,
break, fuel stop and restart that 49 CFR Part 395 requires, plots it on a map,
and draws a filled-in Driver's Daily Log for each day.

**Live:** _add Vercel URL_ · **API:** _add Render URL_ · **Demo:** _add Loom_

---

## Stack

React 18 + Vite on Vercel · Django 5 + DRF on Render · Leaflet + OpenStreetMap
tiles · OSRM for routing · Photon and Nominatim for geocoding · log sheets drawn
as hand-built SVG.

No API keys, nothing paid.

---

## The HOS engine

`backend/trips/hos.py` — pure Python, no Django or network dependency, so it's
unit tested in isolation.

| Rule | Limit | Reg |
| --- | --- | --- |
| Driving limit | 11 hours | § 395.3(a)(3) |
| Driving window | 14 consecutive hours | § 395.3(a)(2) |
| Rest break | 30 min after 8 cumulative driving hours | § 395.3(a)(3)(ii) |
| Off-duty reset | 10 consecutive hours | § 395.3(a)(1) |
| Weekly cycle | 70 hours / 8 days | § 395.3(b)(2) |
| Restart | 34 consecutive hours off duty | § 395.3(c) |

It's a forward simulation: before each stretch of driving it checks the cycle,
the 11-hour limit, the 14-hour window, the 8-hour break counter and the fuel
interval, applies whichever binds first, and continues.

Assumptions from the brief: property-carrying, 70/8, no adverse-driving
exception, 55 mph planning speed, fuel every 1,000 miles, 1 hour on duty at
pickup and at dropoff. Plus a 15-minute pre-trip inspection and post-trip DVIR
(§ 396.11, § 396.13).

### The auditor

`hos.audit()` re-walks the finished timeline and re-derives every clock from
scratch, returning any violation it finds. It runs on every request — the API
returns `compliant` and `violations` — and is the assertion in the test suite.
So compliance is checked independently rather than assumed.

It caught three real bugs during development: a fuel stop not being credited
toward the 30-minute break, miles double-counted on segments crossing midnight,
and a timezone crash on aware datetimes.

### Tests

```bash
cd backend
python -m unittest trips.tests_hos -v      # 27 tests, no Django needed
```

Timeline integrity, each regulatory limit across trips of 50–3,000 miles and
cycle hours of 0–70, the brief's assumptions, and log-sheet correctness (every
sheet accounts for exactly 24 hours, entries tile the day without gaps). Three
tests feed the auditor deliberately illegal timelines to prove it catches them.

---

## Running locally

**macOS / Linux**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

**Windows (PowerShell)** — `&&` and `source` don't work here, so run these as
separate lines:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Use Python 3.12: Django 5.0 doesn't support 3.14. If `Activate.ps1` is blocked,
run `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` once.

Then the frontend, in a second terminal:

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Vite proxies `/api` to port 8000, so no frontend env var is needed in dev.

---

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/trips/plan/` | Plan a trip; returns route, stops, segments and daily logs |
| `GET` | `/api/trips/<id>/` | Re-open a saved plan (the UI deep-links to `?trip=<id>`) |
| `GET` | `/api/trips/` | 20 most recent plans |
| `GET` | `/api/geocode/?q=` | Location lookup |

```bash
curl -X POST http://127.0.0.1:8000/api/trips/plan/ \
  -H 'Content-Type: application/json' \
  -d '{"current_location":"Denver, CO","pickup_location":"Kansas City, MO",
       "dropoff_location":"Atlanta, GA","current_cycle_used":14}'
```

Returns `summary`, `route`, `stops`, `segments`, `days`, `violations` and
`compliant`.

---

## Deploying

**API → Render.** `render.yaml` is a blueprint: New → Blueprint → point at the
repo. Afterwards set `CORS_ALLOWED_ORIGINS` to your Vercel URL and
`GEOCODER_USER_AGENT` to something with a real contact address. The free tier
sleeps, so the first request after a quiet spell takes ~30 s.

It runs on SQLite deliberately. Render's free Postgres expires after 30 days,
and a trip plan is deterministic — the same inputs regenerate the same result —
so persistence is a convenience for shareable `?trip=<id>` links, not something
the app depends on. Switching to Postgres is one env var; `psycopg2-binary` is
already in `requirements.txt`.

**App → Vercel.** Import the repo, set Root Directory to `frontend`, and add
`VITE_API_URL` pointing at the Render URL.

---

## Design decisions

**The type-ahead never calls a geocoder.** Nominatim's
[usage policy](https://operations.osmfoundation.org/policies/nominatim/) lists
autocomplete under *"strictly forbidden and will get you banned"*. So the
location fields filter a local list of ~250 US cities — instant, and the
deployment's IP can't get blocked. Geocoders resolve the three locations once,
at plan time. Free text still works; it just resolves on submit.

**Two geocoders.** Photon is primary, Nominatim is a fallback for the final
resolve only. Results cache for 30 days.

**55 mph, not the router's estimate.** OSRM returns car times. Dispatch plans at
an average that already absorbs traffic and terrain. OSRM's figure is still
returned in `route.duration_hours` for comparison.

**Fuel stops are on duty.** § 395.2 counts fueling as on-duty time, so a
30-minute fuel stop also satisfies the 30-minute break — which changes how many
separate breaks a long trip needs.

**Naive datetimes.** A record of duty status is kept in the home terminal's time
standard (§ 395.8(f)(4)) — wall-clock time, not an instant on a global timeline.
So `USE_TZ = False` and the sheet's midnight lands where the driver expects it.

**SVG log sheets.** One string-returning function backs the on-screen sheet, the
PNG export and the print output, so there's a single drawing to keep correct.

---

## Known limits

The sleeper-berth split (7+3 / 8+2) isn't implemented — the engine always takes
a full 10-hour reset, which is legal but slightly conservative. Adverse driving
conditions and the short-haul exceptions are out of scope per the brief. The
public OSRM and Photon endpoints are best-effort and rate-limited; production
would self-host or use a paid tier.

---

## Layout

```
backend/trips/
  hos.py          # the rules engine (pure Python, no Django)
  tests_hos.py    # 27 unit tests
  services.py     # geocoding + routing, cached
  planner.py      # ties routing and HOS into the API payload
  views.py        # DRF endpoints
frontend/src/
  lib/logsheet.js # draws the DOT daily log as SVG
  lib/cities.js   # local list for instant type-ahead
  components/     # TripForm, RouteMap, Timeline, TripSummary, LogSheets
```
