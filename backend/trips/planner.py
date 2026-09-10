"""
Ties geocoding + routing + the HOS engine together into one plan payload.
"""

from __future__ import annotations

from datetime import datetime

from . import services
from .hos import (
    CYCLE_LIMIT_70_8,
    HOSPlanner,
    RouteIndex,
    recap_for_days,
    split_into_days,
)


def build_plan(
    *,
    current_location: str,
    pickup_location: str,
    dropoff_location: str,
    current_cycle_used: float,
    start_time: datetime,
    driver_name: str = "",
    carrier_name: str = "",
    truck_number: str = "",
) -> dict:
    # 1. Resolve the three place names to coordinates.
    origin = services.geocode(current_location)[0]
    pickup = services.geocode(pickup_location)[0]
    dropoff = services.geocode(dropoff_location)[0]

    # 2. Route through both legs in one call so the geometry is continuous.
    route = services.route(
        [(origin.lat, origin.lon), (pickup.lat, pickup.lon), (dropoff.lat, dropoff.lon)]
    )

    if len(route.legs) >= 2:
        leg1_miles = route.legs[0]["distance_miles"]
        leg2_miles = route.legs[1]["distance_miles"]
    else:
        leg1_miles = route.distance_miles / 2
        leg2_miles = route.distance_miles - leg1_miles

    # 3. Index the polyline so stops can be placed at the right mile marker.
    cum = services.rescale(
        services.cumulative_miles(route.coords), leg1_miles + leg2_miles
    )
    index = RouteIndex(route.coords, cum)

    # 4. Run the HOS simulation.
    planner = HOSPlanner(
        start_time=start_time,
        cycle_used_hours=current_cycle_used,
        leg_to_pickup_miles=leg1_miles,
        leg_to_dropoff_miles=leg2_miles,
        route=index,
        current_label=origin.name,
        pickup_label=pickup.name,
        dropoff_label=dropoff.name,
    )
    result = planner.plan()

    # 5. Shape it into log sheets.
    days = split_into_days(result.segments)
    recap = recap_for_days(days, current_cycle_used)
    for day, rec in zip(days, recap):
        day["recap"] = rec

    return {
        "meta": {
            "driver_name": driver_name,
            "carrier_name": carrier_name,
            "truck_number": truck_number,
            "from_label": origin.name,
            "to_label": dropoff.name,
            "generated_at": datetime.now().isoformat(),
        },
        "places": {
            "origin": origin.to_dict(),
            "pickup": pickup.to_dict(),
            "dropoff": dropoff.to_dict(),
        },
        "route": route.to_dict(),
        "legs": {
            "to_pickup_miles": round(leg1_miles, 1),
            "to_dropoff_miles": round(leg2_miles, 1),
        },
        "summary": {
            "total_miles": round(result.total_miles, 1),
            "total_driving_hours": round(result.total_driving_hours, 2),
            "total_on_duty_hours": round(result.total_on_duty_hours, 2),
            "total_elapsed_hours": round(result.total_elapsed_hours, 2),
            "days_required": len(days),
            "start": result.start.isoformat() if result.start else None,
            "end": result.end.isoformat() if result.end else None,
            "cycle_used_at_start": round(current_cycle_used, 2),
            "cycle_used_at_end": recap[-1]["cycle_used"] if recap else current_cycle_used,
            "cycle_limit": CYCLE_LIMIT_70_8,
            "average_speed_mph": planner.avg_speed,
            "rest_stops": sum(1 for s in result.stops if s.kind == "rest"),
            "fuel_stops": sum(1 for s in result.stops if s.kind == "fuel"),
            "restarts": sum(1 for s in result.stops if s.kind == "restart"),
        },
        "segments": [s.to_dict() for s in result.segments],
        "stops": [s.to_dict() for s in result.stops],
        "days": days,
        "violations": [v.to_dict() for v in result.violations],
        "compliant": not result.violations,
    }
