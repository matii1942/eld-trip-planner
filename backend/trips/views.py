import logging

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.views import exception_handler

from .models import Trip
from .planner import build_plan
from .serializers import (
    TripDetailSerializer,
    TripPlanRequestSerializer,
    TripSummarySerializer,
)
from .services import GeocodingError, RoutingError, geocode

log = logging.getLogger(__name__)


def api_exception_handler(exc, context):
    """Return a consistent {'error': ...} shape for anything unhandled."""
    response = exception_handler(exc, context)
    if response is not None:
        return response
    if isinstance(exc, (GeocodingError, RoutingError)):
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    log.exception("Unhandled API error")
    return Response(
        {"error": "Something went wrong building this plan. Please try again."},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


@api_view(["POST"])
def plan_trip(request):
    """Plan a trip and return the route, stops and filled-in daily logs."""
    serializer = TripPlanRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    try:
        plan = build_plan(**data)
    except (GeocodingError, RoutingError) as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    trip = Trip.objects.create(
        current_location=data["current_location"],
        pickup_location=data["pickup_location"],
        dropoff_location=data["dropoff_location"],
        current_cycle_used=data["current_cycle_used"],
        start_time=data["start_time"],
        driver_name=data.get("driver_name", ""),
        carrier_name=data.get("carrier_name", ""),
        truck_number=data.get("truck_number", ""),
        total_miles=plan["summary"]["total_miles"],
        total_driving_hours=plan["summary"]["total_driving_hours"],
        total_duty_hours=plan["summary"]["total_on_duty_hours"],
        days_required=plan["summary"]["days_required"],
        plan=plan,
    )

    return Response({"id": trip.id, **plan}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def trip_detail(request, pk: int):
    try:
        trip = Trip.objects.get(pk=pk)
    except Trip.DoesNotExist:
        return Response({"error": "Trip not found."}, status=status.HTTP_404_NOT_FOUND)
    payload = TripDetailSerializer(trip).data
    return Response({**payload.pop("plan"), **payload})


@api_view(["GET"])
def trip_list(request):
    trips = Trip.objects.all()[:20]
    return Response(TripSummarySerializer(trips, many=True).data)


@api_view(["GET"])
def geocode_search(request):
    """
    Type-ahead for the location inputs.

    Photon only -- allow_fallback=False keeps Nominatim out of this path.
    Nominatim's usage policy forbids autocomplete outright and will ban the
    caller's IP for it, so this endpoint must never reach it.
    """
    q = request.query_params.get("q", "").strip()
    if len(q) < 4:
        return Response([])
    try:
        places = geocode(q, limit=5, allow_fallback=False)
    except GeocodingError:
        return Response([])
    return Response([p.to_dict() for p in places])
