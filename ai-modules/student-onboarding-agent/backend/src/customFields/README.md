# customFields/ — admin-approved dynamic student fields (Student Import, step 2)

The AI may suggest a new field for a column the LMS has no field for. **The suggestion creates nothing.**
Only an admin's explicit approval creates the field, and only then can the column's data be imported.

## Storage (migration `003_soa_custom_fields.sql`, applied to the live DB on 2026-10-01)

Metadata/value design. No column is ever added to `users`/`students`, and no SQL is built from AI or
client text: a field is a **row**, its key is a **parameter**.

| Table | Holds |
|---|---|
| `soa_custom_fields` | one field per school: `university_id`, `field_key` (unique per school), `label`, `data_type` (`text`/`number`/`date`/`boolean`), `created_by`, `created_at`. CHECK constraints repeat the key/type rules. |
| `soa_custom_field_values` | one value per (student `user_id`, field): normalized text, written in the same transaction as the student. |

Rollback: `003_soa_custom_fields.down.sql` (drops only these two tables).

## Rules (`CustomFieldRules.js`, the single source of truth)

- **key**: `[a-z][a-z0-9_]{1,39}`; never a schema field, system field/alias, LMS column or SQL word.
- **label**: 1–60 characters of plain text (no markup, links, code or instructions).
- **type**: `text | number | date | boolean`. An AI type outside the set becomes `text`; an admin's invalid type is refused.
- **values**: normalized per type; an invalid value is a blocking row error (messages never contain the value).

## Flow

```
AI suggestion (suggestedNewFields, with dataType/confidence)  -> job.mapping.newFields[status: suggested]
admin  POST /imports/:jobId/new-fields/approve { sourceColumn, key?, label?, dataType? }
   -> server validates -> SqliteCustomFieldStore.ensureField (one transaction, this school; reuses an
      identical existing field) -> ImportJobService.approveNewField (status: approved, column -> "custom:<key>")
   -> if the job cannot record it, a field created by this request is removed again (no orphan, no
      "approved" without a field)
admin  POST /imports/:jobId/new-fields/reject { sourceColumn }   -> nothing created; column not imported
import -> custom values validated per type -> createStudent writes them with the student (atomic per student)
read   GET /custom-fields, GET /students/:studentRef/custom-fields (this school only)
```

The guard accepts a `custom:<key>` target only when an admin approved that field for the job; the AI can
never make a custom field a valid target. The `createStudent` tool refuses custom values that differ from
the approved row.

Tests: `backend/test/CustomFields.test.js` (temp databases, fake AI provider).

## Reuse, management and visibility (step 3)

- **Reuse:** at upload the server loads this school's ACTIVE fields and offers them to the mapper as compact
  `{ field: "custom:<key>", label, type }` entries (no values, no usage, never another school's fields). A
  mapping to one is an ordinary AI suggestion the admin approves; no field is created again. New-field
  ideas that duplicate an existing key are dropped. Import approval re-checks that every custom field used
  still exists for the school, is active and has the same type (`CUSTOM_FIELD_NOT_ACTIVE`).
- **Management** (`/custom-fields`): list with type, created, value count, status; `PATCH /custom-fields/:key`
  renames the label (key and values unchanged) or changes the type only while the field has no value
  (`TYPE_CHANGE_REFUSED` otherwise); `POST /custom-fields/:key/retire` keeps the field and its values (still
  readable, flagged `retired`) and stops offering it. Nothing is deleted. A retired key cannot be re-created.
- **Visibility:** admins see a student's values from the user list (own school only, else 404); a student
  sees only their own values on the dashboard (`GET /me/custom-fields`, the only non-admin route, checked
  against the LMS). Teachers have no access.
- Tests: `backend/test/CustomFieldsReuse.test.js`.
