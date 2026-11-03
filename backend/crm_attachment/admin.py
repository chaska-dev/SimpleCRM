from django.contrib import admin

from .models import Attachment


@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "mime_type", "size_bytes", "subject_type", "uploaded_at")
    list_filter = ("owner", "mime_type", "subject_type")
    search_fields = ("title", "description", "original_filename")
    autocomplete_fields = ("owner",)
    readonly_fields = ("size_bytes", "uploaded_at")
