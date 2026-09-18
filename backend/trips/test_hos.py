"""
Unit tests for the HOS engine.

These run without Django (`python -m unittest trips.tests_hos`) because the
engine is pure -- which is the point of keeping it that way.
"""

import unittest
from datetime import datetime, timedelta, timezone

from .hos import (
    CYCLE_LIMIT_70_8,
    DRIVING,
    DRIVING_BEFORE_BREAK,
    MAX_DRIVING_PER_SHIFT,
    MAX_DUTY_WINDOW,
    OFF,
    ON_DUTY,
    REQUIRED_BREAK,
    REQUIRED_RESET,
    RESTART_HOURS,
    SB,
    HOSPlanner,
    audit,
    recap_for_days,
    split_into_days,
)

START = datetime(2026, 3, 2, 6, 0)


def plan(cycle=0.0, leg1=100.0, leg2=500.0, start=START):
    return HOSPlanner(
        start_time=start,
        cycle_used_hours=cycle,
        leg_to_pickup_miles=leg1,
        leg_to_dropoff_miles=leg2,
    ).plan()


class TimelineIntegrity(unittest.TestCase):
    def test_segments_are_contiguous_and_ordered(self):
        r = plan(leg2=1800)
        for a, b in zip(r.segments, r.segments[1:]):
            self.assertEqual(a.end, b.start, "gap or overlap in the timeline")
            self.assertGreater(b.end, b.start, "zero or negative length segment")

    def test_all_boundaries_land_on_whole_minutes(self):
        r = plan(leg2=1400)
        for s in r.segments:
            self.assertEqual(s.start.second, 0)
            self.assertEqual(s.start.microsecond, 0)
            self.assertEqual(s.end.second, 0)
            self.assertEqual(s.end.microsecond, 0)

    def test_distance_is_preserved(self):
        r = plan(leg1=250, leg2=1450)
        self.assertAlmostEqual(r.total_miles, 1700, delta=1.0)

    def test_driving_hours_match_distance_at_planning_speed(self):
        r = plan(leg1=0, leg2=1100)
        self.assertAlmostEqual(r.total_driving_hours, 1100 / 55.0, delta=0.05)


class RegulatoryLimits(unittest.TestCase):
    """The audit is an independent re-check, so an empty list is the assertion."""

    def test_no_violations_across_a_wide_range_of_trips(self):
        cases = [
            (0, 10, 40),        # very short
            (0, 100, 500),
            (20, 180, 900),
            (40, 60, 1600),
            (55, 200, 2400),
            (69, 30, 800),      # almost out of cycle
            (70, 50, 1200),     # starts out of cycle -> must restart first
            (0, 0, 3000),       # already at pickup, coast to coast
        ]
        for cycle, l1, l2 in cases:
            with self.subTest(cycle=cycle, leg1=l1, leg2=l2):
                r = plan(cycle, l1, l2)
                self.assertEqual(
                    [(v.rule, v.detail) for v in r.violations], [], f"cycle={cycle} l1={l1} l2={l2}"
                )

    def test_driving_never_exceeds_11_hours_between_10_hour_resets(self):
        r = plan(leg2=2200)
        drive = 0.0
        off_run = 0.0
        for s in r.segments:
            if s.status in (OFF, SB):
                off_run += s.hours
                if off_run >= REQUIRED_RESET:
                    drive = 0.0
                continue
            off_run = 0.0
            if s.status == DRIVING:
                drive += s.hours
                self.assertLessEqual(round(drive, 6), MAX_DRIVING_PER_SHIFT)

    def test_no_driving_beyond_the_14_hour_window(self):
        r = plan(leg2=2200)
        window_start = None
        off_run = 0.0
        for s in r.segments:
            if s.status in (OFF, SB):
                off_run += s.hours
                if off_run >= REQUIRED_RESET:
                    window_start = None
                continue
            off_run = 0.0
            if window_start is None:
                window_start = s.start
            if s.status == DRIVING:
                elapsed = (s.end - window_start).total_seconds() / 3600
                self.assertLessEqual(round(elapsed, 6), MAX_DUTY_WINDOW)

    def test_a_30_minute_interruption_precedes_the_9th_driving_hour(self):
        r = plan(leg2=2600)
        since_break = 0.0
        off_run = 0.0
        for s in r.segments:
            if s.status in (OFF, SB):
                off_run += s.hours
                if s.hours >= REQUIRED_BREAK:
                    since_break = 0.0
                if off_run >= REQUIRED_RESET:
                    since_break = 0.0
                continue
            off_run = 0.0
            if s.status == ON_DUTY and s.hours >= REQUIRED_BREAK:
                since_break = 0.0
            elif s.status == DRIVING:
                since_break += s.hours
                self.assertLessEqual(round(since_break, 6), DRIVING_BEFORE_BREAK)

    def test_cycle_limit_forces_a_34_hour_restart(self):
        r = plan(cycle=66, leg1=100, leg2=1800)
        restarts = [s for s in r.segments if "34-hour restart" in s.label]
        self.assertTrue(restarts, "a long trip starting at 66 cycle hours must restart")
        for s in restarts:
            self.assertGreaterEqual(s.hours, RESTART_HOURS)
            self.assertEqual(s.status, OFF)

    def test_driver_already_at_the_limit_restarts_before_driving(self):
        r = plan(cycle=CYCLE_LIMIT_70_8, leg1=20, leg2=200)
        self.assertIn("34-hour restart", r.segments[0].label)
        self.assertEqual(r.segments[0].status, OFF)

    def test_every_reset_is_a_full_10_hours(self):
        r = plan(leg2=2000)
        for s in r.segments:
            if "10-hour reset" in s.label:
                self.assertAlmostEqual(s.hours, REQUIRED_RESET, places=6)


class BriefAssumptions(unittest.TestCase):
    def test_pickup_and_dropoff_are_one_hour_of_on_duty_each(self):
        r = plan(leg1=50, leg2=100)
        loading = [s for s in r.segments if "Loading" in s.label]
        unloading = [s for s in r.segments if "Unloading" in s.label]
        self.assertAlmostEqual(sum(s.hours for s in loading), 1.0, places=6)
        self.assertAlmostEqual(sum(s.hours for s in unloading), 1.0, places=6)
        for s in loading + unloading:
            self.assertEqual(s.status, ON_DUTY)

    def test_a_fuel_stop_occurs_at_least_every_1000_miles(self):
        r = plan(leg1=0, leg2=2600)
        fuel = [s for s in r.stops if s.kind == "fuel"]
        self.assertGreaterEqual(len(fuel), 2, "2,600 miles needs at least two fuel stops")
        marks = [0.0] + [s.odometer for s in fuel] + [r.total_miles]
        for a, b in zip(marks, marks[1:]):
            self.assertLessEqual(b - a, 1000.0 + 1.0)

    def test_fueling_is_logged_as_on_duty_not_driving(self):
        r = plan(leg1=0, leg2=1500)
        for s in r.segments:
            if s.label == "Fuel stop":
                self.assertEqual(s.status, ON_DUTY)

    def test_short_trip_needs_no_rest_at_all(self):
        r = plan(leg1=10, leg2=90)
        self.assertEqual([s for s in r.stops if s.kind in ("rest", "restart")], [])
        self.assertEqual(r.violations, [])


class LogSheets(unittest.TestCase):
    def test_every_sheet_accounts_for_exactly_24_hours(self):
        for cycle, l1, l2 in [(0, 100, 500), (30, 180, 1900), (60, 40, 2400)]:
            with self.subTest(cycle=cycle):
                days = split_into_days(plan(cycle, l1, l2).segments)
                for d in days:
                    self.assertAlmostEqual(d["total_hours"], 24.0, places=2, msg=d["date"])

    def test_entries_tile_the_day_without_gaps(self):
        days = split_into_days(plan(leg2=1600).segments)
        for d in days:
            entries = d["entries"]
            self.assertAlmostEqual(entries[0]["start_min"], 0.0, places=2)
            self.assertAlmostEqual(entries[-1]["end_min"], 1440.0, places=2)
            for a, b in zip(entries, entries[1:]):
                self.assertAlmostEqual(a["end_min"], b["start_min"], places=2)

    def test_sheet_count_matches_calendar_days_spanned(self):
        r = plan(leg1=100, leg2=1900)
        days = split_into_days(r.segments)
        expected = (r.end.date() - r.start.date()).days + 1
        self.assertEqual(len(days), expected)

    def test_driving_miles_are_split_across_the_right_days(self):
        r = plan(leg1=100, leg2=1900)
        days = split_into_days(r.segments)
        self.assertAlmostEqual(sum(d["miles_driving"] for d in days), r.total_miles, delta=2.0)

    def test_recap_tracks_the_rolling_cycle(self):
        start_cycle = 20.0
        r = plan(cycle=start_cycle, leg1=100, leg2=900)
        days = split_into_days(r.segments)
        recap = recap_for_days(days, start_cycle)
        self.assertEqual(len(recap), len(days))
        total_on_duty = sum(x["on_duty_today"] for x in recap)
        self.assertAlmostEqual(
            recap[-1]["cycle_used"], start_cycle + total_on_duty, delta=0.05
        )
        for x in recap:
            self.assertAlmostEqual(
                x["available_tomorrow"], max(0.0, CYCLE_LIMIT_70_8 - x["cycle_used"]), places=2
            )

    def test_restart_zeroes_the_recap(self):
        days = split_into_days(plan(cycle=69, leg1=50, leg2=1200).segments)
        recap = recap_for_days(days, 69)
        self.assertTrue(
            any(x["cycle_used"] < 69 for x in recap),
            "the 34-hour restart should drop the cycle total",
        )


class TimezoneAwareInput(unittest.TestCase):
    """
    Regression: the API hands the planner timezone-aware datetimes, but every
    other test here uses naive ones. split_into_days() used datetime.combine(),
    which drops tzinfo, so comparing it against an aware segment end raised
    "can't compare offset-naive and offset-aware datetimes" -- only ever on a
    real request, never in the suite.
    """

    def test_planner_accepts_aware_datetimes(self):
        aware = datetime(2026, 9, 10, 6, 0, tzinfo=timezone.utc)
        r = HOSPlanner(
            start_time=aware,
            cycle_used_hours=14,
            leg_to_pickup_miles=182,
            leg_to_dropoff_miles=1420,
        ).plan()
        self.assertEqual(r.violations, [])
        self.assertIsNotNone(r.start.tzinfo)

    def test_split_into_days_handles_aware_datetimes(self):
        aware = datetime(2026, 9, 10, 6, 0, tzinfo=timezone.utc)
        r = HOSPlanner(
            start_time=aware,
            cycle_used_hours=14,
            leg_to_pickup_miles=182,
            leg_to_dropoff_miles=1420,
        ).plan()
        days = split_into_days(r.segments)
        self.assertTrue(days)
        for d in days:
            self.assertAlmostEqual(d["total_hours"], 24.0, places=2, msg=d["date"])

    def test_aware_and_naive_produce_identical_sheets(self):
        kwargs = dict(cycle_used_hours=20, leg_to_pickup_miles=140, leg_to_dropoff_miles=1500)
        naive = split_into_days(
            HOSPlanner(start_time=datetime(2026, 9, 10, 6, 0), **kwargs).plan().segments
        )
        aware = split_into_days(
            HOSPlanner(
                start_time=datetime(2026, 9, 10, 6, 0, tzinfo=timezone.utc), **kwargs
            ).plan().segments
        )
        self.assertEqual(len(naive), len(aware))
        for a, b in zip(naive, aware):
            self.assertEqual(a["date"], b["date"])
            self.assertEqual(a["totals"], b["totals"])


class AuditSanity(unittest.TestCase):
    """The audit must actually catch a bad timeline, or the other tests prove nothing."""

    def test_audit_flags_twelve_hours_of_driving(self):
        from .hos import Segment

        bad = [Segment(DRIVING, START, START + timedelta(hours=12), "too long")]
        rules = {v.rule for v in audit(bad)}
        self.assertIn("11-hour driving limit", rules)
        self.assertIn("30-minute rest break", rules)

    def test_audit_flags_driving_past_the_window(self):
        from .hos import Segment

        segs = [
            Segment(ON_DUTY, START, START + timedelta(hours=13), "waiting"),
            Segment(DRIVING, START + timedelta(hours=13), START + timedelta(hours=15), "late"),
        ]
        self.assertIn("14-hour driving window", {v.rule for v in audit(segs)})

    def test_audit_is_quiet_on_a_legal_day(self):
        from .hos import Segment

        t = START
        segs = []
        for status, h, label in [
            (ON_DUTY, 0.25, "pre-trip"),
            (DRIVING, 8.0, "drive"),
            (OFF, 0.5, "break"),
            (DRIVING, 3.0, "drive"),
            (ON_DUTY, 1.0, "unload"),
            (SB, 10.0, "reset"),
        ]:
            segs.append(Segment(status, t, t + timedelta(hours=h), label))
            t += timedelta(hours=h)
        self.assertEqual(audit(segs), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
