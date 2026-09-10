"""
FMCSA Hours-of-Service compliance engine (49 CFR Part 395).

Implements the property-carrying driver rules described in FMCSA's
"Interstate Truck Driver's Guide to Hours of Service" (rev. April 2022):

  * 11-hour driving limit          -- Sec. 395.3(a)(3)
  * 14-hour driving window         -- Sec. 395.3(a)(2)
  * 30-minute rest break after
    8 cumulative driving hours     -- Sec. 395.3(a)(3)(ii)
  * 70-hour / 8-day on-duty limit  -- Sec. 395.3(b)(2)
  * 34-hour restart                -- Sec. 395.3(c)
  * 10 consecutive hours off duty  -- Sec. 395.3(a)(1)

The engine is deliberately pure: it takes plain numbers in and returns plain
dataclasses out, with no Django or network dependency, so it can be unit
tested in isolation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Iterable, Literal

# --------------------------------------------------------------------------
# Duty statuses -- the four lines of the driver's daily log grid
# --------------------------------------------------------------------------
OFF = "OFF"          # line 1: Off Duty
SB = "SB"            # line 2: Sleeper Berth
DRIVING = "D"        # line 3: Driving
ON_DUTY = "ON"       # line 4: On Duty (not driving)

Status = Literal["OFF", "SB", "D", "ON"]

STATUS_LABELS = {
    OFF: "Off Duty",
    SB: "Sleeper Berth",
    DRIVING: "Driving",
    ON_DUTY: "On Duty (not driving)",
}

# --------------------------------------------------------------------------
# Regulatory constants (hours unless noted)
# --------------------------------------------------------------------------
MAX_DRIVING_PER_SHIFT = 11.0      # Sec. 395.3(a)(3)
MAX_DUTY_WINDOW = 14.0            # Sec. 395.3(a)(2)
DRIVING_BEFORE_BREAK = 8.0        # Sec. 395.3(a)(3)(ii)
REQUIRED_BREAK = 0.5
REQUIRED_RESET = 10.0             # Sec. 395.3(a)(1)
CYCLE_LIMIT_70_8 = 70.0           # Sec. 395.3(b)(2)
CYCLE_DAYS = 8
RESTART_HOURS = 34.0              # Sec. 395.3(c)

# --------------------------------------------------------------------------
# Operating assumptions stated in the brief
# --------------------------------------------------------------------------
AVG_SPEED_MPH = 55.0              # planning speed for a property-carrying CMV
FUEL_INTERVAL_MILES = 1000.0      # "fueling at least once every 1,000 miles"
FUEL_STOP_HOURS = 0.5             # on-duty, not driving (fueling is on-duty)
PICKUP_HOURS = 1.0                # "1 hour for pickup and drop-off"
DROPOFF_HOURS = 1.0
PRE_TRIP_HOURS = 0.25             # Sec. 396.13 pre-trip inspection
POST_TRIP_HOURS = 0.25            # Sec. 396.11 post-trip / DVIR

EPS = 1e-6


# --------------------------------------------------------------------------
# Output structures
# --------------------------------------------------------------------------
@dataclass
class Segment:
    """One continuous block of a single duty status."""

    status: Status
    start: datetime
    end: datetime
    label: str
    location: str = ""
    lat: float | None = None
    lon: float | None = None
    miles: float = 0.0            # miles covered during this segment
    odometer: float = 0.0         # cumulative trip miles at segment end

    @property
    def hours(self) -> float:
        return (self.end - self.start).total_seconds() / 3600.0

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "status_label": STATUS_LABELS[self.status],
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "hours": round(self.hours, 4),
            "label": self.label,
            "location": self.location,
            "lat": self.lat,
            "lon": self.lon,
            "miles": round(self.miles, 1),
            "odometer": round(self.odometer, 1),
        }


@dataclass
class Stop:
    """A point of interest to render on the map."""

    kind: str                     # start | pickup | dropoff | fuel | break | rest | restart
    label: str
    arrive: datetime
    depart: datetime
    lat: float | None
    lon: float | None
    location: str = ""
    odometer: float = 0.0

    @property
    def hours(self) -> float:
        return (self.depart - self.arrive).total_seconds() / 3600.0

    def to_dict(self) -> dict:
        return {
            "kind": self.kind,
            "label": self.label,
            "arrive": self.arrive.isoformat(),
            "depart": self.depart.isoformat(),
            "hours": round(self.hours, 3),
            "lat": self.lat,
            "lon": self.lon,
            "location": self.location,
            "odometer": round(self.odometer, 1),
        }


@dataclass
class Violation:
    rule: str
    detail: str
    at: datetime

    def to_dict(self) -> dict:
        return {"rule": self.rule, "detail": self.detail, "at": self.at.isoformat()}


@dataclass
class PlanResult:
    segments: list[Segment] = field(default_factory=list)
    stops: list[Stop] = field(default_factory=list)
    violations: list[Violation] = field(default_factory=list)
    total_miles: float = 0.0
    total_driving_hours: float = 0.0
    total_on_duty_hours: float = 0.0
    total_elapsed_hours: float = 0.0
    start: datetime | None = None
    end: datetime | None = None


# --------------------------------------------------------------------------
# Route position helper
# --------------------------------------------------------------------------
class RouteIndex:
    """Maps a cumulative-mile value onto a coordinate along the route."""

    def __init__(self, coords: list[tuple[float, float]], cumulative_miles: list[float]):
        self.coords = coords
        self.cum = cumulative_miles

    def at(self, miles: float) -> tuple[float | None, float | None]:
        if not self.coords:
            return None, None
        if miles <= self.cum[0]:
            return self.coords[0]
        if miles >= self.cum[-1]:
            return self.coords[-1]
        lo, hi = 0, len(self.cum) - 1
        while lo < hi - 1:
            mid = (lo + hi) // 2
            if self.cum[mid] <= miles:
                lo = mid
            else:
                hi = mid
        span = self.cum[hi] - self.cum[lo]
        t = 0.0 if span <= 0 else (miles - self.cum[lo]) / span
        (lat0, lon0), (lat1, lon1) = self.coords[lo], self.coords[hi]
        return (lat0 + (lat1 - lat0) * t, lon0 + (lon1 - lon0) * t)


# --------------------------------------------------------------------------
# The planner
# --------------------------------------------------------------------------
class HOSPlanner:
    """
    Simulates a trip forward in time, inserting the rest, break, fuel and
    restart events the regulations require, and emits a duty-status timeline.
    """

    def __init__(
        self,
        *,
        start_time: datetime,
        cycle_used_hours: float,
        leg_to_pickup_miles: float,
        leg_to_dropoff_miles: float,
        route: RouteIndex | None = None,
        current_label: str = "Current location",
        pickup_label: str = "Pickup",
        dropoff_label: str = "Dropoff",
        avg_speed: float = AVG_SPEED_MPH,
    ):
        self.t = start_time
        self.trip_start = start_time
        self.cycle_used = max(0.0, float(cycle_used_hours))
        self.leg1 = max(0.0, float(leg_to_pickup_miles))
        self.leg2 = max(0.0, float(leg_to_dropoff_miles))
        self.route = route
        self.labels = {
            "start": current_label,
            "pickup": pickup_label,
            "dropoff": dropoff_label,
        }
        self.avg_speed = avg_speed if avg_speed > 0 else AVG_SPEED_MPH

        # rolling clocks
        self.drive_today = 0.0        # hours driven since last 10-hour reset
        self.window_start: datetime | None = None   # start of the 14-hour window
        self.since_break = 0.0        # driving hours since last qualifying break
        self.on_duty_today = 0.0      # on-duty hours in the current shift
        self.odometer = 0.0
        self.miles_since_fuel = 0.0

        self.result = PlanResult(start=start_time)

    # -- low level -------------------------------------------------------
    def _pos(self) -> tuple[float | None, float | None]:
        if self.route is None:
            return None, None
        return self.route.at(self.odometer)

    def _place_name(self) -> str:
        """Human label for the current odometer position."""
        if self.odometer <= EPS:
            return self.labels["start"]
        if abs(self.odometer - self.leg1) < EPS:
            return self.labels["pickup"]
        if abs(self.odometer - (self.leg1 + self.leg2)) < EPS:
            return self.labels["dropoff"]
        return f"Mile {self.odometer:,.0f} en route"

    def _add(self, status: Status, hours: float, label: str, miles: float = 0.0) -> Segment:
        hours = max(0.0, hours)
        lat, lon = self._pos()
        seg = Segment(
            status=status,
            start=self.t,
            end=self.t + timedelta(hours=hours),
            label=label,
            location=self._place_name(),
            lat=lat,
            lon=lon,
            miles=miles,
            odometer=self.odometer,
        )
        self.result.segments.append(seg)
        self.t = seg.end
        return seg

    def _stop(self, kind: str, label: str, arrive: datetime, depart: datetime) -> None:
        lat, lon = self._pos()
        self.result.stops.append(
            Stop(
                kind=kind,
                label=label,
                arrive=arrive,
                depart=depart,
                lat=lat,
                lon=lon,
                location=self._place_name(),
                odometer=self.odometer,
            )
        )

    def _start_window_if_needed(self) -> None:
        if self.window_start is None:
            self.window_start = self.t

    def _window_elapsed(self) -> float:
        if self.window_start is None:
            return 0.0
        return (self.t - self.window_start).total_seconds() / 3600.0

    # -- required rest events -------------------------------------------
    def _take_reset(self, reason: str) -> None:
        """10 consecutive hours off duty -- restarts the 11 and 14 clocks."""
        arrive = self.t
        seg = self._add(SB, REQUIRED_RESET, f"10-hour reset ({reason})")
        self._stop("rest", "10-hour off-duty reset", arrive, seg.end)
        self.drive_today = 0.0
        self.on_duty_today = 0.0
        self.since_break = 0.0
        self.window_start = None

    def _take_restart(self) -> None:
        """34 consecutive hours off duty -- zeroes the 70-hour cycle."""
        arrive = self.t
        seg = self._add(OFF, RESTART_HOURS, "34-hour restart (70-hr cycle exhausted)")
        self._stop("restart", "34-hour restart", arrive, seg.end)
        self.cycle_used = 0.0
        self.drive_today = 0.0
        self.on_duty_today = 0.0
        self.since_break = 0.0
        self.window_start = None

    def _take_break(self) -> None:
        """30-minute interruption of driving after 8 cumulative driving hours."""
        arrive = self.t
        self._start_window_if_needed()
        seg = self._add(OFF, REQUIRED_BREAK, "30-minute rest break (8 hrs driving)")
        self._stop("break", "30-minute rest break", arrive, seg.end)
        self.since_break = 0.0
        # NOTE: the break does not stop the 14-hour window and does not add
        # to on-duty time, but it does consume window time.

    def _take_fuel(self) -> None:
        """Fuel stop -- fueling is on-duty, not driving (Sec. 395.2)."""
        arrive = self.t
        self._start_window_if_needed()
        seg = self._add(ON_DUTY, FUEL_STOP_HOURS, "Fuel stop")
        self._stop("fuel", "Fuel stop", arrive, seg.end)
        self.on_duty_today += FUEL_STOP_HOURS
        self.cycle_used += FUEL_STOP_HOURS
        self.miles_since_fuel = 0.0
        # A 30-minute fuel stop is a consecutive non-driving period, so it
        # satisfies the 30-minute break requirement (Sec. 395.3(a)(3)(ii)).
        self.since_break = 0.0

    # -- on-duty work ----------------------------------------------------
    def _do_on_duty(self, hours: float, label: str, kind: str) -> None:
        remaining = hours
        while remaining > EPS:
            self._ensure_capacity_for_on_duty()
            self._start_window_if_needed()
            window_left = MAX_DUTY_WINDOW - self._window_elapsed()
            cycle_left = CYCLE_LIMIT_70_8 - self.cycle_used
            # On-duty-not-driving work MAY continue past the 14-hour window
            # (only driving is barred), but for planning we keep the shift
            # intact so the driver is legal to drive afterwards.
            chunk = min(remaining, max(window_left, 0.25), max(cycle_left, 0.25))
            arrive = self.t
            seg = self._add(ON_DUTY, chunk, label)
            if kind:
                self._stop(kind, label, arrive, seg.end)
                kind = ""  # only record the stop marker once
            self.on_duty_today += chunk
            self.cycle_used += chunk
            # A 30+ minute consecutive non-driving period satisfies the
            # 30-minute break requirement -- Sec. 395.3(a)(3)(ii).
            if chunk >= REQUIRED_BREAK - EPS:
                self.since_break = 0.0
            remaining -= chunk

    def _ensure_capacity_for_on_duty(self) -> None:
        if self.cycle_used >= CYCLE_LIMIT_70_8 - EPS:
            self._take_restart()
        elif self.window_start is not None and self._window_elapsed() >= MAX_DUTY_WINDOW - EPS:
            self._take_reset("14-hour window expired")

    # -- driving ---------------------------------------------------------
    def _drive(self, miles: float, destination_label: str) -> None:
        remaining = miles
        while remaining > EPS:
            hours_needed = remaining / self.avg_speed

            # 1. Weekly cycle -- most binding, check first.
            if self.cycle_used >= CYCLE_LIMIT_70_8 - EPS:
                self._take_restart()
                continue

            # 2. Daily driving limit / duty window.
            self._start_window_if_needed()
            drive_left = MAX_DRIVING_PER_SHIFT - self.drive_today
            window_left = MAX_DUTY_WINDOW - self._window_elapsed()
            if drive_left <= EPS:
                self._take_reset("11-hour driving limit reached")
                continue
            if window_left <= EPS:
                self._take_reset("14-hour window expired")
                continue

            # 3. 30-minute break after 8 cumulative driving hours.
            break_left = DRIVING_BEFORE_BREAK - self.since_break
            if break_left <= EPS:
                self._take_break()
                continue

            # 4. Fuel at least once every 1,000 miles.
            fuel_left_miles = FUEL_INTERVAL_MILES - self.miles_since_fuel
            if fuel_left_miles <= EPS:
                self._take_fuel()
                continue

            cycle_left = CYCLE_LIMIT_70_8 - self.cycle_used
            allowed = min(
                hours_needed,
                drive_left,
                window_left,
                break_left,
                cycle_left,
                fuel_left_miles / self.avg_speed,
            )
            if allowed <= EPS:
                # Should be unreachable; guard against an infinite loop.
                self._take_reset("no driving capacity remaining")
                continue

            chunk_miles = allowed * self.avg_speed
            self.odometer += chunk_miles
            seg = self._add(DRIVING, allowed, f"Driving to {destination_label}", miles=chunk_miles)
            seg.odometer = self.odometer

            self.drive_today += allowed
            self.since_break += allowed
            self.on_duty_today += allowed
            self.cycle_used += allowed
            self.miles_since_fuel += chunk_miles
            remaining -= chunk_miles

    # -- public ----------------------------------------------------------
    def plan(self) -> PlanResult:
        # If the driver is already at or over the cycle limit, they must
        # restart before doing anything at all.
        if self.cycle_used >= CYCLE_LIMIT_70_8 - EPS:
            self._take_restart()

        # Pre-trip inspection -- starts the 14-hour window.
        start_of_day = self.t
        self._start_window_if_needed()
        self._add(ON_DUTY, PRE_TRIP_HOURS, "Pre-trip inspection")
        self.on_duty_today += PRE_TRIP_HOURS
        self.cycle_used += PRE_TRIP_HOURS
        self._stop("start", f"Trip start — {self.labels['start']}", start_of_day, self.t)

        # Leg 1: current location -> pickup
        if self.leg1 > EPS:
            self._drive(self.leg1, self.labels["pickup"])
        self.odometer = self.leg1

        # Pickup: 1 hour on duty
        self._do_on_duty(PICKUP_HOURS, f"Loading at {self.labels['pickup']}", "pickup")

        # Leg 2: pickup -> dropoff
        if self.leg2 > EPS:
            self._drive(self.leg2, self.labels["dropoff"])
        self.odometer = self.leg1 + self.leg2

        # Dropoff: 1 hour on duty
        self._do_on_duty(DROPOFF_HOURS, f"Unloading at {self.labels['dropoff']}", "dropoff")

        # Post-trip inspection.
        self._add(ON_DUTY, POST_TRIP_HOURS, "Post-trip inspection / DVIR")
        self.on_duty_today += POST_TRIP_HOURS
        self.cycle_used += POST_TRIP_HOURS

        self._finalise()
        return self.result

    def _snap_to_minutes(self) -> None:
        """
        Real logs are drawn to the nearest minute (ELDs round to the minute),
        so quantise every boundary while keeping the timeline contiguous and
        dropping any segment that rounds away to nothing.
        """
        segs = self.result.segments
        if not segs:
            return

        def snap(dt: datetime) -> datetime:
            return (dt + timedelta(seconds=30)).replace(second=0, microsecond=0)

        cursor = snap(segs[0].start)
        kept: list[Segment] = []
        for seg in segs:
            end = snap(seg.end)
            if end <= cursor:
                continue
            seg.start = cursor
            seg.end = end
            kept.append(seg)
            cursor = end
        self.result.segments = kept

        # Re-anchor the stop markers onto the snapped timeline.
        for stop in self.result.stops:
            stop.arrive = snap(stop.arrive)
            stop.depart = snap(stop.depart)

        self.trip_start = kept[0].start
        self.t = kept[-1].end

    def _finalise(self) -> None:
        self._snap_to_minutes()
        r = self.result
        r.start = self.trip_start
        r.end = self.t
        r.total_miles = self.odometer
        r.total_driving_hours = sum(s.hours for s in r.segments if s.status == DRIVING)
        r.total_on_duty_hours = sum(
            s.hours for s in r.segments if s.status in (DRIVING, ON_DUTY)
        )
        r.total_elapsed_hours = (self.t - self.trip_start).total_seconds() / 3600.0
        r.violations = audit(r.segments)


# --------------------------------------------------------------------------
# Independent audit -- re-checks the produced timeline against the rules.
# Used both as a safety net in production and as the assertion in tests.
# --------------------------------------------------------------------------
def audit(segments: Iterable[Segment]) -> list[Violation]:
    violations: list[Violation] = []
    drive = 0.0
    since_break = 0.0
    off_run = 0.0
    window_start: datetime | None = None

    for seg in segments:
        h = seg.hours
        if seg.status in (OFF, SB):
            off_run += h
            if off_run >= REQUIRED_RESET - EPS:
                drive = 0.0
                since_break = 0.0
                window_start = None
            if h >= REQUIRED_BREAK - EPS:
                since_break = 0.0
            continue

        off_run = 0.0
        # Sec. 395.3(a)(3)(ii): the 30-minute interruption of driving may be
        # taken on duty, off duty, or in the sleeper berth -- so a fuel stop
        # or a loading period of 30+ consecutive minutes qualifies.
        if seg.status == ON_DUTY and h >= REQUIRED_BREAK - EPS:
            since_break = 0.0
        if window_start is None:
            window_start = seg.start

        if seg.status == DRIVING:
            elapsed = (seg.end - window_start).total_seconds() / 3600.0
            if elapsed > MAX_DUTY_WINDOW + EPS:
                violations.append(
                    Violation("14-hour driving window", f"Driving {elapsed:.2f}h into the window", seg.end)
                )
            drive += h
            since_break += h
            if drive > MAX_DRIVING_PER_SHIFT + EPS:
                violations.append(
                    Violation("11-hour driving limit", f"{drive:.2f}h driven in shift", seg.end)
                )
            if since_break > DRIVING_BEFORE_BREAK + EPS:
                violations.append(
                    Violation(
                        "30-minute rest break",
                        f"{since_break:.2f}h driving without a 30-minute interruption",
                        seg.end,
                    )
                )
        else:
            # On-duty not driving still consumes the window but is only a
            # violation if the driver drives afterwards, which the driving
            # branch above catches.
            pass

    return violations


# --------------------------------------------------------------------------
# Day splitting -- turn the timeline into one record of duty status per day
# --------------------------------------------------------------------------
def split_into_days(segments: list[Segment]) -> list[dict]:
    """
    Splits segments at midnight and groups them by calendar date so each day
    can be drawn on its own log sheet. Times are returned as minutes past
    midnight, which is what the grid renderer wants.
    """
    if not segments:
        return []

    by_day: dict[str, list[dict]] = {}
    order: list[str] = []

    for seg in segments:
        cur = seg.start
        seg_seconds = max((seg.end - seg.start).total_seconds(), 1e-9)
        while cur < seg.end:
            day = cur.date()
            # Derive midnight from the timestamp itself rather than with
            # datetime.combine(), which would drop tzinfo and make this
            # comparison raise on timezone-aware input.
            day_start = cur.replace(hour=0, minute=0, second=0, microsecond=0)
            midnight = day_start + timedelta(days=1)
            chunk_end = min(seg.end, midnight)
            key = day.isoformat()
            if key not in by_day:
                by_day[key] = []
                order.append(key)
            start_min = (cur - day_start).total_seconds() / 60.0
            end_min = (chunk_end - day_start).total_seconds() / 60.0
            # A segment that straddles midnight has its miles prorated by
            # time so the two sheets do not each claim the whole leg.
            share = (chunk_end - cur).total_seconds() / seg_seconds
            by_day[key].append(
                {
                    "status": seg.status,
                    "start_min": round(start_min, 2),
                    "end_min": round(end_min, 2),
                    "label": seg.label,
                    "location": seg.location,
                    "miles": round(seg.miles * share, 1),
                }
            )
            cur = chunk_end

    # A record of duty status must account for all 24 hours of the day, so
    # pad the head of the first sheet and the tail of the last sheet with
    # off-duty time (Sec. 395.8(f)).
    for key in order:
        entries = by_day[key]
        entries.sort(key=lambda e: e["start_min"])
        if entries[0]["start_min"] > 0:
            entries.insert(
                0,
                {
                    "status": OFF,
                    "start_min": 0.0,
                    "end_min": entries[0]["start_min"],
                    "label": "Off duty",
                    "location": "",
                    "miles": 0.0,
                },
            )
        if entries[-1]["end_min"] < 24 * 60:
            entries.append(
                {
                    "status": OFF,
                    "start_min": entries[-1]["end_min"],
                    "end_min": 24 * 60.0,
                    "label": "Off duty",
                    "location": "",
                    "miles": 0.0,
                }
            )

    days: list[dict] = []
    for i, key in enumerate(order):
        entries = by_day[key]
        totals = {OFF: 0.0, SB: 0.0, DRIVING: 0.0, ON_DUTY: 0.0}
        for e in entries:
            totals[e["status"]] += (e["end_min"] - e["start_min"]) / 60.0

        remarks = []
        seen = set()
        for e in entries:
            if e["status"] == DRIVING or e["label"] == "Off duty":
                continue
            sig = (round(e["start_min"]), e["label"])
            if sig in seen:
                continue
            seen.add(sig)
            remarks.append(
                {
                    "start_min": e["start_min"],
                    "text": e["label"],
                    "location": e["location"],
                }
            )

        located = [e["location"] for e in entries if e.get("location")]
        days.append(
            {
                "day_number": i + 1,
                "date": key,
                "from_label": located[0] if located else "",
                "to_label": located[-1] if located else "",
                "entries": entries,
                "totals": {k: round(v, 2) for k, v in totals.items()},
                "total_hours": round(sum(totals.values()), 2),
                "miles_driving": round(sum(e["miles"] for e in entries), 1),
                "remarks": remarks,
            }
        )
    return days


def recap_for_days(days: list[dict], starting_cycle_used: float) -> list[dict]:
    """
    Fills in the 'Recap' boxes at the bottom right of the log sheet:
    the rolling 70-hour / 8-day totals.
    """
    running = float(starting_cycle_used)
    out = []
    window: list[float] = []
    for day in days:
        today_on_duty = day["totals"][DRIVING] + day["totals"][ON_DUTY]
        # A 34-hour restart zeroes the cycle.
        restarted = any("34-hour restart" in e["label"] for e in day["entries"])
        if restarted:
            running = 0.0
            window = []
        running += today_on_duty
        window.append(today_on_duty)
        if len(window) > CYCLE_DAYS:
            running -= window.pop(0)
        out.append(
            {
                "date": day["date"],
                "on_duty_today": round(today_on_duty, 2),
                "cycle_used": round(running, 2),
                "available_tomorrow": round(max(0.0, CYCLE_LIMIT_70_8 - running), 2),
            }
        )
    return out
