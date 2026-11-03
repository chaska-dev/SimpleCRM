from django.urls import path

from .views import CsrfView, LoginView, LogoutView, MeView, RegisterView, RegistrationStatusView

app_name = "accounts"

urlpatterns = [
    path("csrf/", CsrfView.as_view(), name="csrf"),
    path("registration-status/", RegistrationStatusView.as_view(), name="registration-status"),
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
]
