from datetime import datetime

from rest_framework import serializers

from .hos import CYCLE_LIMIT_70_8
from .models import Trip


class TripPlanRequestSerializer(serializers.Serializer):
    current_location = serializers.CharField(max_length=255)
    pickup_location = serializers.CharField(max_length=255)
    dropoff_location = serializers.CharField(max_length=255)
    current_cycle_used = serializers.FloatField(min_value=0, max_value=CYCLE_LIMIT_70_8)
    start_time = serializers.DateTimeField(required=False)

    driver_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    carrier_name = serializers.CharField(max_length=160, required=False, allow_blank=True)
    truck_number = serializers.CharField(max_length=60, required=False, allow_blank=True)

    def validate_current_cycle_used(self, value: float) -> float:
        if value < 0:
            raise serializers.ValidationError("Cycle hours cannot be negative.")
        if value > CYCLE_LIMIT_70_8:
            raise serializers.ValidationError(
                f"The 70-hour / 8-day limit is {CYCLE_LIMIT_70_8:.0f} hours."
            )
        return value

    def validate(self, attrs):
        start = attrs.get("start_time")
        if not start:
            start = datetime.now().replace(minute=0, second=0, microsecond=0)
        elif start.tzinfo is not None:
            # Belt and braces: the log grid works in home-terminal wall clock,
            # so never let an aware datetime reach the planner.
            start = start.replace(tzinfo=None)
        attrs["start_time"] = start
        for field in ("current_location", "pickup_location", "dropoff_location"):
            attrs[field] = attrs[field].strip()
            if len(attrs[field]) < 2:
                raise serializers.ValidationError({field: "Please enter a location."})
        return attrs


class TripSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Trip
        fields = [
            "id",
            "current_location",
            "pickup_location",
            "dropoff_location",
            "current_cycle_used",
            "start_time",
            "driver_name",
            "carrier_name",
            "truck_number",
            "total_miles",
            "total_driving_hours",
            "total_duty_hours",
            "days_required",
            "created_at",
        ]


class TripDetailSerializer(TripSummarySerializer):
    class Meta(TripSummarySerializer.Meta):
        fields = TripSummarySerializer.Meta.fields + ["plan"]
