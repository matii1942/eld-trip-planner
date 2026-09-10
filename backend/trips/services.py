"""
Geocoding and routing against free, key-less public services.

  * Nominatim (OpenStreetMap) for forward geocoding
  * OSRM demo server for road routing

Both are free and require no API key, which is what the brief asked for.
Results are cached in the database so repeated planning of the same trip
does not hammer the public endpoints (both ask for <= 1 req/sec).
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass

import requests
from django.conf import settings
from django.core.cache import cache

METERS_PER_MILE = 1609.344

# Photon is komoot's OSM geocoder. It is built for type-ahead and is the
# primary here. Nominatim is the fallback for the final resolve only --
# its usage policy forbids autocomplete outright, so it must never be
# called per keystroke:
#   https://operations.osmfoundation.org/policies/nominatim/
PHOTON_URL = "https://photon.komoot.io/api/"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OSRM_URL = "https://router.project-osrm.org/route/v1/driving"

# Both services require a User-Agent that identifies the application; a stock
# library UA or an obvious placeholder domain gets blocked. Override
# GEOCODER_USER_AGENT with a real contact address before deploying.
USER_AGENT = getattr(
    settings,
    "GEOCODER_USER_AGENT",
    "ELDTripPlanner/1.0 (+https://github.com/; hos-trip-planner)",
)

_last_call = {"nominatim": 0.0}


class GeocodingError(Exception):
    pass


class RoutingError(Exception):
    pass


@dataclass
class Place:
    query: str
    name: str
    lat: float
    lon: float

    def to_dict(self) -> dict:
        return {"query": self.query, "name": self.name, "lat": self.lat, "lon": self.lon}


@dataclass
class Route:
    coords: list[tuple[float, float]]      # [(lat, lon), ...]
    distance_miles: float
    duration_hours: float                  # OSRM's car estimate, for reference
    legs: list[dict]

    def to_dict(self) -> dict:
        return {
            "coords": [[round(a, 5), round(b, 5)] for a, b in self.coords],
            "distance_miles": round(self.distance_miles, 1),
            "duration_hours": round(self.duration_hours, 2),
            "legs": self.legs,
        }


def _throttle(key: str, min_interval: float = 1.1) -> None:
    now = time.monotonic()
    wait = min_interval - (now - _last_call.get(key, 0.0))
    if wait > 0:
        time.sleep(wait)
    _last_call[key] = time.monotonic()


def geocode(query: str, *, limit: int = 1, allow_fallback: bool = True) -> list[Place]:
    """
    Forward-geocode a free-text place name.

    Photon is tried first; Nominatim is a fallback only when Photon is down
    or returns nothing. Pass allow_fallback=False for type-ahead traffic so
    Nominatim is never hit per keystroke.
    """
    query = (query or "").strip()
    if not query:
        raise GeocodingError("Empty location.")

    cache_key = f"geocode:v2:{query.lower()}:{limit}"
    cached = cache.get(cache_key)
    if cached is not None:
        return [Place(**p) for p in cached]

    places: list[Place] = []
    errors: list[str] = []

    try:
        places = _geocode_photon(query, limit)
    except GeocodingError as exc:
        errors.append(f"Photon: {exc}")

    if not places and allow_fallback:
        try:
            places = _geocode_nominatim(query, limit)
        except GeocodingError as exc:
            errors.append(f"Nominatim: {exc}")

    if not places:
        if errors:
            raise GeocodingError(
                f"Could not look up '{query}'. Geocoding services are unavailable "
                f"right now ({'; '.join(errors)})."
            )
        raise GeocodingError(
            f"Could not find a location matching '{query}'. "
            "Try a 'City, ST' form such as 'Denver, CO'."
        )

    cache.set(cache_key, [p.to_dict() for p in places], 60 * 60 * 24 * 30)
    return places


def _geocode_photon(query: str, limit: int) -> list[Place]:
    try:
        resp = requests.get(
            PHOTON_URL,
            params={"q": query, "limit": max(limit, 1), "lang": "en"},
            headers={"User-Agent": USER_AGENT},
            timeout=12,
        )
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError) as exc:
        raise GeocodingError(str(exc)) from exc

    places = []
    for feat in (data.get("features") or [])[:limit]:
        coords = (feat.get("geometry") or {}).get("coordinates") or []
        if len(coords) < 2:
            continue
        props = feat.get("properties") or {}
        places.append(
            Place(
                query=query,
                name=_photon_name(props),
                lat=float(coords[1]),
                lon=float(coords[0]),
            )
        )
    return places


def _photon_name(props: dict) -> str:
    """Assemble a short 'Place, City, ST' label from Photon's fields."""
    parts: list[str] = []
    house = props.get("housenumber")
    street = props.get("street")
    if street:
        parts.append(f"{house} {street}".strip() if house else street)
    elif props.get("name"):
        parts.append(props["name"])

    for key in ("city", "county", "state"):
        value = props.get(key)
        if value and value not in parts:
            parts.append(value)
        if len(parts) >= 3:
            break

    code = props.get("countrycode")
    if code and code != "US" and len(parts) < 4:
        parts.append(code)

    return ", ".join(parts) if parts else props.get("name", "Unknown location")


def _geocode_nominatim(query: str, limit: int) -> list[Place]:
    _throttle("nominatim")
    try:
        resp = requests.get(
            NOMINATIM_URL,
            params={
                "q": query,
                "format": "json",
                "limit": limit,
                "addressdetails": 0,
                "countrycodes": "us,ca,mx",
            },
            headers={"User-Agent": USER_AGENT, "Accept-Language": "en"},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError) as exc:
        raise GeocodingError(str(exc)) from exc

    return [
        Place(
            query=query,
            name=_short_name(item.get("display_name", query)),
            lat=float(item["lat"]),
            lon=float(item["lon"]),
        )
        for item in data
    ]


def _short_name(display_name: str) -> str:
    """Nominatim returns very long names; keep the useful head and the state."""
    parts = [p.strip() for p in display_name.split(",")]
    if len(parts) <= 3:
        return ", ".join(parts)
    keep = [parts[0]]
    for part in parts[1:]:
        if part.isdigit() and len(part) == 5:      # postcode
            continue
        keep.append(part)
        if len(keep) == 3:
            break
    return ", ".join(keep)


def route(points: list[tuple[float, float]]) -> Route:
    """Road route through an ordered list of (lat, lon) waypoints."""
    if len(points) < 2:
        raise RoutingError("Need at least two points to build a route.")

    coord_str = ";".join(f"{lon:.6f},{lat:.6f}" for lat, lon in points)
    cache_key = f"route:{coord_str}"
    cached = cache.get(cache_key)
    if cached is not None:
        return Route(
            coords=[tuple(c) for c in cached["coords"]],
            distance_miles=cached["distance_miles"],
            duration_hours=cached["duration_hours"],
            legs=cached["legs"],
        )

    try:
        resp = requests.get(
            f"{OSRM_URL}/{coord_str}",
            params={"overview": "full", "geometries": "geojson", "steps": "false"},
            headers={"User-Agent": USER_AGENT},
            timeout=25,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as exc:
        raise RoutingError(f"Routing service unavailable: {exc}") from exc

    if data.get("code") != "Ok" or not data.get("routes"):
        raise RoutingError(data.get("message", "No route found between those locations."))

    r = data["routes"][0]
    coords = [(lat, lon) for lon, lat in r["geometry"]["coordinates"]]
    legs = [
        {
            "distance_miles": round(leg["distance"] / METERS_PER_MILE, 1),
            "duration_hours": round(leg["duration"] / 3600.0, 2),
        }
        for leg in r.get("legs", [])
    ]
    result = Route(
        coords=coords,
        distance_miles=r["distance"] / METERS_PER_MILE,
        duration_hours=r["duration"] / 3600.0,
        legs=legs,
    )
    cache.set(cache_key, result.to_dict() | {"coords": result.coords}, 60 * 60 * 24)
    return result


def haversine_miles(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * 3958.7613 * math.asin(math.sqrt(h))


def cumulative_miles(coords: list[tuple[float, float]]) -> list[float]:
    """Running distance along a polyline, used to place stops on the map."""
    out = [0.0]
    for i in range(1, len(coords)):
        out.append(out[-1] + haversine_miles(coords[i - 1], coords[i]))
    return out


def rescale(cum: list[float], target_total: float) -> list[float]:
    """
    Haversine over the polyline slightly undercounts road distance versus
    OSRM's own figure; scale so the last value matches OSRM exactly.
    """
    if not cum or cum[-1] <= 0:
        return cum
    k = target_total / cum[-1]
    return [c * k for c in cum]
