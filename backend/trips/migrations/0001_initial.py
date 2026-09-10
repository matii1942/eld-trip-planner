from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Trip",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("current_location", models.CharField(max_length=255)),
                ("pickup_location", models.CharField(max_length=255)),
                ("dropoff_location", models.CharField(max_length=255)),
                (
                    "current_cycle_used",
                    models.FloatField(
                        help_text="On-duty hours already used in the driver's 70-hour / 8-day cycle."
                    ),
                ),
                ("start_time", models.DateTimeField()),
                ("driver_name", models.CharField(blank=True, max_length=120)),
                ("carrier_name", models.CharField(blank=True, max_length=160)),
                ("truck_number", models.CharField(blank=True, max_length=60)),
                ("total_miles", models.FloatField(default=0)),
                ("total_driving_hours", models.FloatField(default=0)),
                ("total_duty_hours", models.FloatField(default=0)),
                ("days_required", models.IntegerField(default=0)),
                ("plan", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
