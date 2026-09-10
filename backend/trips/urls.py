from django.urls import path

from . import views

urlpatterns = [
    path("trips/plan/", views.plan_trip, name="plan-trip"),
    path("trips/", views.trip_list, name="trip-list"),
    path("trips/<int:pk>/", views.trip_detail, name="trip-detail"),
    path("geocode/", views.geocode_search, name="geocode"),
]
