from django.contrib import admin

from .models import AgentAction, ApiToken


@admin.register(ApiToken)
class ApiTokenAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "prefix", "scopes", "last_used_at", "expires_at", "revoked_at")
    list_filter = ("owner",)
    # Neither the hash nor the encrypted token (token_enc, editable=False) appear in the admin.
    readonly_fields = ("token_hash", "prefix", "created_at", "last_used_at")
    exclude = ("token_hash",)


@admin.register(AgentAction)
class AgentActionAdmin(admin.ModelAdmin):
    list_display = ("created_at", "owner", "tool_name", "status", "target_type", "target_id")
    list_filter = ("status", "tool_name")
    readonly_fields = [f.name for f in AgentAction._meta.fields]
