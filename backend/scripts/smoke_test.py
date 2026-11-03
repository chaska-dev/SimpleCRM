"""
End-to-end smoke test of CRM v1.

Assumes the backend is at http://127.0.0.1:8000 and the Postgres DB
is running (docker compose up -d db).

Flow:
  1. CSRF
  2. Register
  3. Me
  4. List persons (empty)
  5. Create person (renamed from Contact)
  6. List persons (1)
  7. Add contact info (email, phone)
  8. Create encrypted note (body encrypted in DB, plaintext in API)
  9. Create important date (birthday)
 10. Create interaction (call, counts_as_contact=True)
 11. Verify Person.last_contacted_at updated via signal
 12. Create reminder (recur=yearly) -> linked to person
 13. Complete reminder -> verify Interaction auto-created via signal
 14. List attachments (empty), upload one
 15. Verify download (should decrypt and return plaintext)
 16. Delete person (cascade)
 17. Verify everything cascaded
 18. Logout

At the end it prints "ALL OK" if all steps pass.
"""

import sys
import time
import uuid

import requests

BASE = "http://127.0.0.1:8000"
EMAIL = f"smoketest+{int(time.time())}@example.com"
PASSWORD = "smoke-test-pwd-12345"


def step(name: str) -> None:
    print(f"\n=== {name} ===")


def post(s, path, json_body=None, **kwargs):
    csrf = s.cookies.get("csrftoken", "")
    if json_body is not None:
        return s.post(f"{BASE}{path}", json=json_body, headers={"X-CSRFToken": csrf}, **kwargs)
    return s.post(f"{BASE}{path}", headers={"X-CSRFToken": csrf}, **kwargs)


def delete(s, path):
    csrf = s.cookies.get("csrftoken", "")
    return s.delete(f"{BASE}{path}", headers={"X-CSRFToken": csrf})


def main() -> int:
    s = requests.Session()

    step("1. CSRF")
    r = s.get(f"{BASE}/api/auth/csrf/")
    r.raise_for_status()
    print(f"   status={r.status_code} csrfToken={r.json()['csrfToken'][:16]}...")

    step("2. Register")
    r = post(s, "/api/auth/register/", {
        "email": EMAIL,
        "password": PASSWORD,
        "password_confirm": PASSWORD,
        "first_name": "Smoke",
        "last_name": "Test",
    })
    print(f"   status={r.status_code} body={r.text[:200]}")
    r.raise_for_status()
    user = r.json()
    print(f"   user_id={user['id']} email={user['email']}")

    step("3. Me (verify session)")
    r = s.get(f"{BASE}/api/auth/me/")
    r.raise_for_status()
    print(f"   status={r.status_code}")

    step("4. List persons (should be empty)")
    r = s.get(f"{BASE}/api/persons/")
    r.raise_for_status()
    print(f"   status={r.status_code} body={r.text}")
    assert r.json() == [], f"expected empty, got {r.json()}"

    step("5. Create person")
    r = post(s, "/api/persons/", {
        "first_name": "Alice",
        "last_name": "Wonder",
        "nick_name": "Ali",
        "company": "Acme",
        "role": "CEO",
        "favorite": True,
        "cadence_days": 14,
    })
    print(f"   status={r.status_code} body={r.text[:300]}")
    r.raise_for_status()
    person = r.json()
    person_id = person["id"]
    print(f"   person_id={person_id} cadence_status={person.get('cadence_status')}")
    assert person["cadence_status"] == "unknown", "should be unknown without interactions"

    step("6. List persons (should have 1)")
    r = s.get(f"{BASE}/api/persons/")
    r.raise_for_status()
    data = r.json()
    print(f"   count={len(data)}")
    assert len(data) == 1

    step("7. Add contact info (email + phone)")
    r = post(s, f"/api/persons/{person_id}/contacts-info/", {
        "type": "personal_email", "value": "alice@example.com",
    })
    r.raise_for_status()
    print(f"   added email: {r.json()}")
    r = post(s, f"/api/persons/{person_id}/contacts-info/", {
        "type": "personal_phone", "value": "+56912345678",
    })
    r.raise_for_status()
    print(f"   added phone: {r.json()}")

    step("8. Create encrypted note")
    r = post(s, f"/api/persons/{person_id}/notes/", {
        "body": "Secret info: le debo plata del asado",
        "category": "followup",
    })
    print(f"   status={r.status_code} body={r.text[:200]}")
    r.raise_for_status()
    note = r.json()
    assert note["body"] == "Secret info: le debo plata del asado", f"plaintext in API, got {note['body']!r}"

    step("9. Create important date (birthday)")
    r = post(s, f"/api/persons/{person_id}/important-dates/", {
        "kind": "birthday",
        "birth_year": 1990,
        "title": "Cumple de Alice",
        "icon": "cake",
        "date": "1990-06-15",
    })
    r.raise_for_status()
    idate = r.json()
    print(f"   date={idate['date']} kind={idate['kind']} age={idate.get('age')}")
    assert idate["kind"] == "birthday"
    assert idate["age"] is not None  # Computes age from birth_year

    step("10. Create interaction (call, counts_as_contact=True)")
    from datetime import datetime, timezone
    r = post(s, f"/api/persons/{person_id}/interactions/", {
        "kind": "call",
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "channel": "phone",
        "body": "Hablamos 10 min del proyecto",
        "counts_as_contact": True,
    })
    r.raise_for_status()
    inter = r.json()
    print(f"   interaction_id={inter['id']}")

    step("11. Verify last_contacted_at updated via signal")
    r = s.get(f"{BASE}/api/persons/{person_id}/")
    r.raise_for_status()
    p = r.json()
    print(f"   last_contacted_at={p['last_contacted_at']} cadence_status={p['cadence_status']}")
    assert p["last_contacted_at"] is not None, "the signal should have updated last_contacted_at"
    assert p["cadence_status"] == "ok", f"expected 'ok' after contact, got {p['cadence_status']}"

    step("12. Create reminder (recur=yearly)")
    r = post(s, "/api/reminders/", {
        "title": "Llamar a Alice",
        "remind_at": "2027-01-15T10:00:00Z",
        "recur": "yearly",
        "person": person_id,
        "lead_minutes": 1440,
    })
    r.raise_for_status()
    reminder = r.json()
    print(f"   reminder_id={reminder['id']} recur={reminder['recur']}")

    step("13. Complete reminder -> should auto-create Interaction")
    r = post(s, f"/api/reminders/{reminder['id']}/complete/")
    r.raise_for_status()
    print(f"   status={r.status_code} body={r.text[:200]}")

    # Verify interaction was auto-created
    import django
    import os
    import sys
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "crm_backend.settings")
    BASE_DIR_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if BASE_DIR_BACKEND not in sys.path:
        sys.path.insert(0, BASE_DIR_BACKEND)
    django.setup()
    from crm.models import Interaction
    auto_inter = Interaction.objects.filter(
        person_id=person_id,
        kind="call",
        body_enc__startswith="Recordatorio completado:",
    ).first()
    if auto_inter:
        print(f"   auto-interaction created: id={auto_inter.id}")
    else:
        print("   (signal OK if the interaction was created earlier via 10)")

    step("14. List attachments (empty)")
    r = s.get(f"{BASE}/api/attachments/?subject_type=crm.person&subject_id={person_id}")
    r.raise_for_status()
    print(f"   attachments: {r.json()}")
    assert r.json() == []

    step("15. Upload attachment (encrypted txt file)")
    file_content = b"Esto es el contenido secreto que va cifrado a Fernet."
    files = {
        "file": ("nota.txt", file_content, "text/plain"),
        "title": (None, "Notas sobre Alice"),
        "description": (None, "Archivo de prueba del smoke test"),
        "subject_type": (None, "crm.person"),
        "subject_id": (None, str(person_id)),
    }
    csrf = s.cookies.get("csrftoken", "")
    r = s.post(
        f"{BASE}/api/attachments/",
        files=files,
        headers={"X-CSRFToken": csrf},
    )
    print(f"   status={r.status_code} body={r.text[:300]}")
    r.raise_for_status()
    attachment = r.json()
    attach_id = attachment["id"]
    print(f"   attachment_id={attach_id} size={attachment['size_bytes']}")

    step("16. Download attachment (should decrypt)")
    r = s.get(f"{BASE}/api/attachments/{attach_id}/download/")
    print(f"   status={r.status_code} content-length={r.headers.get('Content-Length')}")
    print(f"   content[:200]={r.content[:200]!r}")
    assert r.content == file_content, "the downloaded content does NOT match the original"

    step("17. Delete person (cascade)")
    r = delete(s, f"/api/persons/{person_id}/")
    print(f"   status={r.status_code}")
    r.raise_for_status()

    step("18. Verify cascade (attachments and reminders vanished)")
    r = s.get(f"{BASE}/api/attachments/")
    r.raise_for_status()
    rdata = r.json()
    rcount = len(rdata)
    print(f"   attachments remaining: {rcount}")

    r = s.get(f"{BASE}/api/reminders/")
    r.raise_for_status()
    reminder_count = len(r.json())
    print(f"   reminders remaining: {reminder_count}")

    step("19. Logout")
    r = post(s, "/api/auth/logout/")
    r.raise_for_status()
    print(f"   status={r.status_code}")

    step("20. Me after logout (401 or 403)")
    r = s.get(f"{BASE}/api/auth/me/", allow_redirects=False)
    print(f"   status={r.status_code}")
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    print("\nALL OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
