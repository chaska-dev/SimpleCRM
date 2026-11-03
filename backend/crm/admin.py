from django.contrib import admin

from .models import (
    ContactInfo,
    ImportantDate,
    Interaction,
    Note,
    Organization,
    Person,
    PersonOrganization,
    Reminder,
    Tag,
)


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ("name", "color", "owner", "created_at")
    list_filter = ("owner",)
    search_fields = ("name",)


class ContactInfoInline(admin.TabularInline):
    model = ContactInfo
    extra = 1
    fields = ("type", "value", "label")


class ImportantDateInline(admin.TabularInline):
    model = ImportantDate
    extra = 0
    fields = ("kind", "title", "date", "recurrence", "icon", "birth_year", "attachment")
    autocomplete_fields = ("attachment",)


class NoteInline(admin.StackedInline):
    model = Note
    extra = 0
    fields = ("category", "body_enc")
    # body_enc is encrypted; the admin decrypts it on render (from_db_value).


@admin.register(Person)
class PersonAdmin(admin.ModelAdmin):
    list_display = (
        "first_name", "last_name", "nick_name", "company", "role",
        "favorite", "owner", "cadence_days", "last_contacted_at", "updated_at",
    )
    list_filter = ("owner", "favorite", "tags")
    search_fields = ("first_name", "last_name", "nick_name", "company")
    filter_horizontal = ("tags",)
    autocomplete_fields = ("owner",)
    inlines = [ContactInfoInline, ImportantDateInline, NoteInline]
    fieldsets = (
        (None, {
            "fields": ("owner", "first_name", "last_name", "nick_name"),
        }),
        ("Contexto", {
            "fields": ("company", "role", "how_we_met_enc", "favorite"),
        }),
        ("Cadencia", {
            "fields": ("cadence_days", "last_contacted_at"),
            "description": "Cadencia + último contacto. El signal actualiza "
                           "last_contacted_at desde Interaction.counts_as_contact.",
        }),
        ("Tags", {
            "fields": ("tags",),
        }),
    )

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(owner=request.user)


@admin.register(ContactInfo)
class ContactInfoAdmin(admin.ModelAdmin):
    list_display = ("person", "type", "value", "label")
    list_filter = ("type",)
    search_fields = ("value", "person__first_name", "person__last_name")
    autocomplete_fields = ("person",)


@admin.register(ImportantDate)
class ImportantDateAdmin(admin.ModelAdmin):
    list_display = ("title", "person", "kind", "date", "recurrence", "icon")
    list_filter = ("kind", "recurrence")
    search_fields = ("title", "person__first_name", "person__last_name")
    autocomplete_fields = ("person", "attachment")
    fields = ("person", "kind", "birth_year", "title", "description",
              "icon", "icon_image", "date", "recurrence", "attachment")
    # Icon preview in list_display could use a virtual field if we wanted one.


@admin.register(Interaction)
class InteractionAdmin(admin.ModelAdmin):
    list_display = ("person", "kind", "occurred_at", "counts_as_contact", "channel")
    list_filter = ("kind", "counts_as_contact", "person__owner")
    search_fields = ("person__first_name", "person__last_name", "channel")
    autocomplete_fields = ("person",)
    raw_id_fields = ("person",)


@admin.register(Reminder)
class ReminderAdmin(admin.ModelAdmin):
    list_display = (
        "title", "remind_at", "status", "kind", "completed", "recur",
        "lead_minutes", "person", "owner", "updated_at",
    )
    list_filter = ("status", "kind", "completed", "recur", "owner")
    search_fields = ("title",)
    autocomplete_fields = ("owner", "person")
    filter_horizontal = ("participants",)


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ("person", "category", "created_at", "updated_at")
    list_filter = ("category", "person__owner")
    search_fields = ("person__first_name", "person__last_name")
    autocomplete_fields = ("person",)


class PersonOrganizationInline(admin.TabularInline):
    model = PersonOrganization
    extra = 0
    fields = ("person", "role", "is_current", "start_year", "end_year")
    autocomplete_fields = ("person",)


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "kind", "city", "country", "owner", "updated_at")
    list_filter = ("kind", "owner")
    search_fields = ("name", "city", "address")
    filter_horizontal = ("tags",)
    autocomplete_fields = ("owner",)
    inlines = [PersonOrganizationInline]


@admin.register(PersonOrganization)
class PersonOrganizationAdmin(admin.ModelAdmin):
    list_display = ("person", "organization", "role", "is_current", "start_year", "end_year")
    list_filter = ("is_current",)
    search_fields = ("person__first_name", "person__last_name", "organization__name", "role")
    autocomplete_fields = ("person", "organization")
