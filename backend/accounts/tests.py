"""Tests for interface preferences (language, theme, accent) and the welcome screen."""

import os
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient, APITestCase

User = get_user_model()
PASSWORD = "Prueba-Segura-2026!"


class UserPreferencesTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="prefs@simplecrm.test", username="prefs", password=PASSWORD
        )

    def _login(self):
        return self.client.post(
            "/api/auth/login/", {"email": self.user.email, "password": PASSWORD}, format="json"
        )

    def test_defaults(self):
        self.assertEqual(self.user.preferred_lang, "es")
        self.assertEqual(self.user.preferred_theme, "dark")
        self.assertEqual(self.user.preferred_accent, "#db2777")
        self.assertFalse(self.user.onboarding_completed)

    def test_login_sets_pref_cookies(self):
        res = self._login()
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["preferred_theme"], "dark")
        for name, value in [
            ("preferred_lang", "es"),
            ("preferred_theme", "dark"),
            ("preferred_accent", "#db2777"),
        ]:
            cookie = res.cookies[name]
            self.assertEqual(cookie.value, value)
            self.assertEqual(cookie["path"], "/")
            self.assertEqual(cookie["samesite"], "Lax")
            self.assertEqual(int(cookie["max-age"]), 365 * 24 * 3600)
            self.assertFalse(cookie["httponly"])

    def test_patch_updates_and_sets_cookies(self):
        self.client.force_authenticate(self.user)
        res = self.client.patch(
            "/api/auth/me/",
            {
                "preferred_lang": "en",
                "preferred_theme": "light",
                "preferred_accent": "#16A34A",
                "onboarding_completed": True,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["preferred_accent"], "#16a34a")
        self.assertEqual(res.cookies["preferred_lang"].value, "en")
        self.assertEqual(res.cookies["preferred_theme"].value, "light")
        self.user.refresh_from_db()
        self.assertTrue(self.user.onboarding_completed)

    def test_me_get_sets_cookies_from_user(self):
        self.user.preferred_lang = "en"
        self.user.save()
        self.client.force_authenticate(self.user)
        res = self.client.get("/api/auth/me/")
        self.assertEqual(res.cookies["preferred_lang"].value, "en")

    def test_rejects_invalid_values(self):
        self.client.force_authenticate(self.user)
        for body in [
            {"preferred_accent": "red"},
            {"preferred_accent": "#12345"},
            {"preferred_accent": "#gggggg"},
            {"preferred_lang": "fr"},
            {"preferred_theme": "blue"},
            {"onboarding_completed": "quizas"},
        ]:
            res = self.client.patch("/api/auth/me/", body, format="json")
            self.assertEqual(res.status_code, 400, body)
        self.user.refresh_from_db()
        self.assertEqual(self.user.preferred_accent, "#db2777")

    def test_requires_auth(self):
        res = APIClient().patch("/api/auth/me/", {"preferred_lang": "en"}, format="json")
        self.assertIn(res.status_code, (401, 403))


class RegistrationTests(APITestCase):
    """Registration of the first account: open only with no users or with ALLOW_REGISTRATION."""

    STATUS_URL = "/api/auth/registration-status/"
    REGISTER_URL = "/api/auth/register/"
    NEW_USER = {
        "email": "primera@simplecrm.test",
        "first_name": "Ana",
        "last_name": "Rojas",
        "password": PASSWORD,
        "password_confirm": PASSWORD,
    }

    def _register(self, **overrides):
        body = {**self.NEW_USER, **overrides}
        return self.client.post(self.REGISTER_URL, body, format="json")

    def _make_existing_user(self):
        return User.objects.create_user(
            email="existente@simplecrm.test", username="existente", password=PASSWORD
        )

    def test_status_is_public_and_open_without_users(self):
        res = APIClient().get(self.STATUS_URL)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"can_register": True, "users_count": 0})

    def test_status_closed_with_users(self):
        self._make_existing_user()
        res = APIClient().get(self.STATUS_URL)
        self.assertEqual(res.json(), {"can_register": False, "users_count": 1})

    @override_settings(ALLOW_REGISTRATION=True)
    def test_status_open_with_users_when_allowed(self):
        self._make_existing_user()
        res = APIClient().get(self.STATUS_URL)
        self.assertEqual(res.json(), {"can_register": True, "users_count": 1})

    def test_register_allowed_without_users(self):
        res = self._register()
        self.assertEqual(res.status_code, 201, res.content)
        user = User.objects.get(email="primera@simplecrm.test")
        self.assertTrue(user.check_password(PASSWORD))
        self.assertEqual((user.first_name, user.last_name), ("Ana", "Rojas"))
        # Automatic login: the session stays open.
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 200)

    def test_register_defaults_and_cookies(self):
        res = self._register()
        self.assertEqual(res.status_code, 201)
        user = User.objects.get(email="primera@simplecrm.test")
        self.assertFalse(user.onboarding_completed)
        self.assertEqual(user.preferred_theme, "dark")
        self.assertEqual(user.preferred_accent, "#db2777")
        self.assertEqual(user.preferred_lang, "es")
        self.assertFalse(res.json()["onboarding_completed"])
        self.assertEqual(res.cookies["preferred_theme"].value, "dark")
        self.assertEqual(res.cookies["preferred_accent"].value, "#db2777")
        self.assertEqual(res.cookies["preferred_lang"].value, "es")

    def test_register_language_from_cookie(self):
        self.client.cookies["preferred_lang"] = "en"
        res = self._register()
        self.assertEqual(res.status_code, 201)
        self.assertEqual(User.objects.get().preferred_lang, "en")
        self.assertEqual(res.cookies["preferred_lang"].value, "en")

    def test_register_language_from_accept_language(self):
        res = self.client.post(
            self.REGISTER_URL, self.NEW_USER, format="json", HTTP_ACCEPT_LANGUAGE="en-US,en;q=0.9"
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(User.objects.get().preferred_lang, "en")

    def test_register_language_cookie_beats_accept_language(self):
        self.client.cookies["preferred_lang"] = "es"
        res = self.client.post(
            self.REGISTER_URL, self.NEW_USER, format="json", HTTP_ACCEPT_LANGUAGE="en-US"
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(User.objects.get().preferred_lang, "es")

    def test_register_ignores_client_supplied_preferences(self):
        res = self._register(onboarding_completed=True, preferred_theme="light", is_staff=True)
        self.assertEqual(res.status_code, 201)
        user = User.objects.get()
        self.assertFalse(user.onboarding_completed)
        self.assertEqual(user.preferred_theme, "dark")
        self.assertFalse(user.is_staff)

    def test_register_rejected_with_users(self):
        self._make_existing_user()
        res = self._register()
        self.assertEqual(res.status_code, 403)
        self.assertIn("cerrado", res.json()["detail"])
        self.assertEqual(User.objects.count(), 1)

    @override_settings(ALLOW_REGISTRATION=True)
    def test_register_allowed_with_flag(self):
        self._make_existing_user()
        res = self._register()
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(User.objects.count(), 2)
        self.assertFalse(User.objects.get(email="primera@simplecrm.test").onboarding_completed)

    def test_register_allowed_with_env_variable(self):
        self._make_existing_user()
        with mock.patch.dict(os.environ, {"ALLOW_REGISTRATION": "true"}):
            self.assertEqual(self._register().status_code, 201)

    def test_register_rejects_weak_and_mismatched_passwords(self):
        for body, field in [
            ({"password": "corta1", "password_confirm": "corta1"}, "password"),
            ({"password": "1234567890123", "password_confirm": "1234567890123"}, "password"),
            ({"password": "password1234", "password_confirm": "password1234"}, "password"),
            ({"password": PASSWORD, "password_confirm": PASSWORD + "x"}, "password_confirm"),
        ]:
            res = self._register(**body)
            self.assertEqual(res.status_code, 400, body)
            self.assertIn(field, res.json(), body)
        self.assertEqual(User.objects.count(), 0)

    def test_register_rejects_password_similar_to_email(self):
        res = self._register(email="josefina@simplecrm.test", password="josefina-simplecrm", password_confirm="josefina-simplecrm")
        self.assertEqual(res.status_code, 400)
        self.assertIn("password", res.json())

    @override_settings(ALLOW_REGISTRATION=True)
    def test_register_rejects_duplicate_email_case_insensitive(self):
        self._make_existing_user()
        res = self._register(email="EXISTENTE@simplecrm.test")
        self.assertEqual(res.status_code, 400)
        self.assertIn("email", res.json())

    @override_settings(ALLOW_REGISTRATION=True)
    def test_register_derives_unique_username(self):
        User.objects.create_user(email="otro@a.test", username="primera", password=PASSWORD)
        res = self._register()
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(User.objects.get(email="primera@simplecrm.test").username, "primera2")


class LoginTests(APITestCase):
    URL = "/api/auth/login/"

    def test_email_is_case_insensitive_even_if_stored_with_capitals(self):
        User.objects.create_user(email="Mixto@simplecrm.test", username="mixto", password=PASSWORD)
        for email in ("mixto@simplecrm.test", "  MIXTO@SimpleCRM.test ", "Mixto@simplecrm.test"):
            res = APIClient().post(self.URL, {"email": email, "password": PASSWORD}, format="json")
            self.assertEqual(res.status_code, 200, email)
        bad = APIClient().post(
            self.URL, {"email": "mixto@simplecrm.test", "password": "mala"}, format="json",
        )
        self.assertEqual(bad.status_code, 401)

    def test_malformed_bodies_return_400(self):
        for body in (
            ["a", "b"],
            {"email": ["x"], "password": "y"},
            {"email": "x@y.test", "password": 123},
        ):
            res = APIClient().post(self.URL, body, format="json")
            self.assertEqual(res.status_code, 400, body)


class CsrfEnforcementTests(APITestCase):
    def test_login_and_register_require_csrf_token(self):
        client = APIClient(enforce_csrf_checks=True)
        res = client.post("/api/auth/login/", {"email": "a@b.test", "password": "x"}, format="json")
        self.assertEqual(res.status_code, 403)
        res = client.post("/api/auth/register/", RegistrationTests.NEW_USER, format="json")
        self.assertEqual(res.status_code, 403)
        self.assertEqual(User.objects.count(), 0)
        # With a valid token (cookie + header) the check passes.
        token = client.get("/api/auth/csrf/").json()["csrfToken"]
        res = client.post(
            "/api/auth/login/", {"email": "a@b.test", "password": "x"},
            format="json", HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(res.status_code, 401)
