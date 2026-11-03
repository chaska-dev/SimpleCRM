"""
Serve the MCP over stdio (for Claude Desktop and other local clients).

    python manage.py mcp_serve --token crm_xxx
    CRM_MCP_TOKEN=crm_xxx python manage.py mcp_serve

IMPORTANT: stdout is the protocol channel. This command prints nothing there;
error messages go to stderr.
"""

import os

from django.core.management.base import BaseCommand, CommandError

from crm_mcp.auth import AuthError, authenticate


class Command(BaseCommand):
    help = "Start the MCP server over stdio with an API token."
    requires_system_checks = []

    def add_arguments(self, parser):
        parser.add_argument(
            "--token", default="",
            help="crm_... token (alternative: CRM_MCP_TOKEN environment variable).",
        )

    def handle(self, *args, **options):
        raw = (options["token"] or os.environ.get("CRM_MCP_TOKEN", "")).strip()
        if not raw:
            raise CommandError("Missing token: use --token or the CRM_MCP_TOKEN variable.")
        try:
            principal = authenticate(raw)
        except AuthError as exc:
            raise CommandError(str(exc))

        from crm_mcp.server import mcp, set_stdio_token

        set_stdio_token(raw)
        self.stderr.write(f"MCP stdio ready for {principal.user.email} (token {principal.token.prefix}...)")
        mcp.run("stdio")
