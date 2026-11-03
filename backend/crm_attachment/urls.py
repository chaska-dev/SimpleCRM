from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AttachmentViewSet

app_name = "crm_attachment"

router = DefaultRouter()
router.register("", AttachmentViewSet, basename="attachment")

urlpatterns = [
    path("", include(router.urls)),
]
