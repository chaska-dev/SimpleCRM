from django.urls import path

from .views import (
    ActionListView,
    ActionUndoView,
    ConfigView,
    TokenRevealView,
    TokenListCreateView,
    TokenRevokeView,
)

app_name = "crm_mcp"

urlpatterns = [
    path("tokens/", TokenListCreateView.as_view(), name="tokens"),
    path("tokens/<int:pk>/reveal/", TokenRevealView.as_view(), name="token-reveal"),
    path("tokens/<int:pk>/revoke/", TokenRevokeView.as_view(), name="token-revoke"),
    path("actions/", ActionListView.as_view(), name="actions"),
    path("actions/<int:pk>/undo/", ActionUndoView.as_view(), name="action-undo"),
    path("config/", ConfigView.as_view(), name="config"),
]
