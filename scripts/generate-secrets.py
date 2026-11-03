#!/usr/bin/env python3
"""
Generates the Docker stack secrets and writes `.env.docker` (only if it does NOT exist).

    python scripts/generate-secrets.py                    # creates ./.env.docker
    python scripts/generate-secrets.py --output PATH      # another destination (e.g. tests)
    python scripts/generate-secrets.py --new-encryption-key   # prints ONE new Fernet key
                                                          # (for rotation; writes nothing)

Standard library only. Generates:
  DJANGO_SECRET_KEY      64 random url-safe bytes
  FIELD_ENCRYPTION_KEYS  one Fernet key (32 random bytes in url-safe base64)
  POSTGRES_PASSWORD      32 random url-safe bytes

Starts from `.env.docker.example` (keeps its comments and non-secret values) and fills in
the three secrets. NEVER overwrites an existing file and does not print the secrets.
The file is created with restricted permissions (0600; on Windows the inherited
permissions are removed with icacls when available).
"""

from __future__ import annotations

import argparse
import base64
import os
import re
import secrets
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / ".env.docker.example"
DEFAULT_OUTPUT = ROOT / ".env.docker"


def fernet_key() -> str:
    """Valid Fernet key: 32 random bytes in url-safe base64 (same as Fernet.generate_key)."""
    return base64.urlsafe_b64encode(os.urandom(32)).decode("ascii")


def build_secrets() -> dict[str, str]:
    return {
        "DJANGO_SECRET_KEY": secrets.token_urlsafe(64),
        "FIELD_ENCRYPTION_KEYS": fernet_key(),
        "POSTGRES_PASSWORD": secrets.token_urlsafe(32),
    }


def render(template_text: str, values: dict[str, str]) -> str:
    """Fill in the empty `KEY=` entries of the template; append any that are missing at the end."""
    out = template_text
    for key, value in values.items():
        pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
        if pattern.search(out):
            out = pattern.sub(lambda _m, k=key, v=value: f"{k}={v}", out, count=1)
        else:
            out = out.rstrip("\n") + f"\n{key}={value}\n"
    return out


def restrict_permissions(path: Path) -> str:
    """Make the file readable only by the current user when the OS allows it."""
    if os.name == "nt":
        user = os.environ.get("USERNAME")
        if not user:
            return "could not determine the Windows user; check the permissions manually"
        try:
            result = subprocess.run(
                ["icacls", str(path), "/inheritance:r", "/grant:r", f"{user}:F"],
                capture_output=True, text=True, timeout=15,
            )
        except (OSError, subprocess.SubprocessError):
            return "icacls not available; check the permissions manually"
        return "permissions restricted with icacls" if result.returncode == 0 else "icacls failed; check the permissions manually"
    try:
        os.chmod(path, 0o600)
        return "permissions 0600"
    except OSError:
        return "could not change the permissions"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="File to create (default: ./.env.docker).")
    parser.add_argument("--template", type=Path, default=TEMPLATE, help="Template (default: ./.env.docker.example).")
    parser.add_argument(
        "--new-encryption-key", action="store_true",
        help="Print a new Fernet key for rotation and exit (writes no files).",
    )
    args = parser.parse_args()

    if args.new_encryption_key:
        print(fernet_key())
        return 0

    output: Path = args.output
    if not args.template.is_file():
        print(f"ERROR: template {args.template} does not exist", file=sys.stderr)
        return 2

    text = render(args.template.read_text(encoding="utf-8"), build_secrets())

    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        # O_EXCL: fails if it exists (never overwrites); mode 0600 from creation.
        fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        print(f"{output} already exists: not overwriting. Delete it by hand if you really want to regenerate it\n"
              "(WARNING: changing FIELD_ENCRYPTION_KEYS makes already-encrypted data unreadable).")
        return 1
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)

    note = restrict_permissions(output)
    print(f"Created {output} ({note}).")
    print("Secrets generated: DJANGO_SECRET_KEY, FIELD_ENCRYPTION_KEYS, POSTGRES_PASSWORD (not shown).")
    print("Keep a copy of FIELD_ENCRYPTION_KEYS OFF the server: without it the backups cannot be read.")
    print("Do not commit it to git (.env.docker is in .gitignore).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
