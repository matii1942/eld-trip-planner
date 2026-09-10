# Loom script (3–5 min)

Aim for 4 minutes. Have the live site open, plus `hos.py` and `tests_hos.py` in
your editor. Record the app first while it's fresh, then the code.

---

## 0:00 — What it does (30 s)

> "This takes trip details in and gives back route instructions and drawn ELD
> logs. Current location, pickup, dropoff, and how many hours the driver has
> already burned in their 70-hour 8-day cycle."

Fill in **Denver, CO → Kansas City, MO → Atlanta, GA**, cycle at **14 hours**.
Point out the typeahead hitting the geocoder. Hit **Plan trip**.

## 0:30 — The output (60 s)

Walk the summary strip: 1,602 miles, 29 h driving, 52 h total, 3 log sheets,
cycle ends at 46 of 70 hours. Land on the **HOS compliant** badge — say the
badge is computed by an independent audit, not asserted by the planner.

Scroll the stop list:

> "It's not just a route — it inserted a fuel stop at mile 1,000 because the
> brief says fuel every thousand miles, an hour on duty at pickup and at
> dropoff, and two 10-hour resets where the 11-hour driving limit ran out."

Then the map: route polyline, colour-coded markers, click the fuel stop popup.
Then the timeline bar: "the whole trip as one bar, coloured by duty status —
you can see drive/rest alternating."

## 1:30 — The log sheets (60 s)

> "This is the part that had to be right. It's the actual DOT form — four duty
> rows, the 24-hour grid with quarter-hour ticks, remarks, the recap boxes."

Tab through Day 1 → 2 → 3. On Day 2 point at the Total column:

> "Eleven hours of driving exactly, which is the limit, and the four rows add
> up to 24:00 — a log sheet that doesn't account for all 24 hours is rejected."

Show the remarks line pointing at the hour each duty change happened. Click
**PNG** to show the export.

## 2:30 — The code (75 s)

Open `backend/trips/hos.py`:

> "The rules engine is pure Python — no Django import, no network. It's a
> forward simulation: it tries to drive, and before each chunk it checks the
> 70-hour cycle, the 11-hour limit, the 14-hour window, the 8-hour break
> counter and the fuel interval, takes whichever remedy binds first, and
> continues."

Scroll to `audit()`:

> "Then this re-walks the finished timeline and re-derives every clock
> independently. If the planner and the auditor disagree, the auditor wins and
> the API says non-compliant. It caught two real bugs while I was building —
> the planner wasn't crediting a fuel stop toward the 30-minute break, and
> miles were double-counted on segments crossing midnight."

Run the tests on camera:

```bash
python -m unittest trips.tests_hos
```

> "24 tests — trips from 50 to 3,000 miles, cycle hours from 0 to 70. Three of
> them feed the auditor deliberately illegal timelines to prove it actually
> catches things."

## 3:45 — Close (20 s)

> "React and Vite on Vercel, Django REST on Render, Leaflet with OpenStreetMap,
> OSRM for routing, Nominatim for geocoding — no API keys and nothing paid.
> The log sheet is hand-drawn SVG so the same function does the screen, the PNG
> and the print output."

Mention one honest limitation — the sleeper-berth 7+3 split isn't implemented,
so it always takes a full 10-hour reset, which is legal but slightly
conservative.

---

### Don't forget

- Say "record of duty status" at least once — it signals you read the reg
- Have the trip already planned once before recording so Render is warm
  (free tier cold start is ~30 s)
- Keep the browser at 100% zoom so the log sheet is legible in the recording
