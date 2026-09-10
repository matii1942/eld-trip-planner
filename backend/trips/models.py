from django.db import models


class Trip(models.Model):
    """A planned trip. Persisted so a plan can be shared by URL."""

    current_location = models.CharField(max_length=255)
    pickup_location = models.CharField(max_length=255)
    dropoff_location = models.CharField(max_length=255)
    current_cycle_used = models.FloatField(
        help_text="On-duty hours already used in the driver's 70-hour / 8-day cycle."
    )
    start_time = models.DateTimeField()

    driver_name = models.CharField(max_length=120, blank=True)
    carrier_name = models.CharField(max_length=160, blank=True)
    truck_number = models.CharField(max_length=60, blank=True)

    total_miles = models.FloatField(default=0)
    total_driving_hours = models.FloatField(default=0)
    total_duty_hours = models.FloatField(default=0)
    days_required = models.IntegerField(default=0)

    plan = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.pickup_location} -> {self.dropoff_location} ({self.total_miles:.0f} mi)"
