from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ContactInfoViewSet,
    DashboardViewSet,
    ImportantDateViewSet,
    InteractionViewSet,
    NoteViewSet,
    OrganizationViewSet,
    PersonViewSet,
    ReminderViewSet,
    TagViewSet,
)

app_name = "crm"

router = DefaultRouter()
router.register("persons", PersonViewSet, basename="person")
router.register("reminders", ReminderViewSet, basename="reminder")
router.register("tags", TagViewSet, basename="tag")
router.register("organizations", OrganizationViewSet, basename="organization")

# Nested resources under /persons/{person_pk}/<resource>/
person_router = DefaultRouter()
person_router.register("contacts-info", ContactInfoViewSet, basename="person-contactsinfo")
person_router.register("important-dates", ImportantDateViewSet, basename="person-importantdate")
person_router.register("interactions", InteractionViewSet, basename="person-interaction")
person_router.register("notes", NoteViewSet, basename="person-note")

urlpatterns = [
    path("", include(router.urls)),
    path("persons/<int:person_pk>/", include(person_router.urls)),
    path("dashboard/", DashboardViewSet.as_view({"get": "list"}), name="dashboard"),
]
