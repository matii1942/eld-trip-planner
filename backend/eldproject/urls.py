from django.http import JsonResponse
from django.urls import include, path


def health(_request):
    return JsonResponse({"status": "ok", "service": "eld-trip-planner"})


urlpatterns = [
    path("", health),
    path("api/", include("trips.urls")),
]
