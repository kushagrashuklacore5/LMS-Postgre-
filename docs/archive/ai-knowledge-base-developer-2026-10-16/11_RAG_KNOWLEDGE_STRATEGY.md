# RAG knowledge strategy

This is a design recommendation for a future chatbot that uses retrieval-augmented generation (RAG). No vector database or embedding provider is chosen here; that needs a separate design decision.

## What goes where

| Knowledge | Source | How the bot gets it | Why |
|---|---|---|---|
| How the LMS works: features, rules, roles, errors | This folder (`docs/ai-knowledge-base/`) | **Static index** | Same for everyone; changes with releases |
| User help and FAQs (to be written) | Product docs | Static index | Same for everyone |
| Course learning material: chapter text, PDFs, materials | `chapters`, `course_materials`, uploads | **Scoped index**, or live fetch | Belongs to a course; only enrolled students and the course's teacher may see it |
| A student's own data: attendance, results, fees, tests, lectures | LMS database | **Live tool call only** ([10](10_AI_TOOL_CATALOG.md)) | Personal, changes constantly, and must pass server permissions |
| Another person's data | — | **Never**, except staff through tools the server allows | Privacy |
| Secrets, configuration values | Environment | Never | Security |

**Rule:** live records of a student, class or school are **never** copied into a vector index. They are fetched at question time with the user's own session, so the server decides what they may see.

## Static index: chunking and metadata

- **Chunking.**
  - Chunk by Markdown heading: one `##` or `###` section per chunk, a few hundred words at most.
  - The documents are already written that way: one subject per section, descriptive headings, evidence paths inside the section.
  - Keep tables whole; split very long tables by row groups and repeat the header.
- **Metadata on every chunk:**
  - `doc` (file name), `section` (heading path), `anchor` (link target);
  - `audience` (`all`, `staff`, `admin`, `developer`);
  - `topic` (for example `enrolment`, `live-classes`, `fees`);
  - `confidence` (Verified, Documented, Inferred, Gap);
  - `analysed_on` (date).
- **Audience filter.** Filter by audience before retrieval, so that a student is not shown developer or security detail (for example [12](12_GAPS_AND_OPEN_QUESTIONS.md) or [03](03_ROLES_PERMISSIONS.md#unverified-or-inconsistent-permission-behaviour)). Suggested defaults:
  - 05, 06, 08, 12 and `_ANALYSIS_NOTES` → `developer`;
  - 03 → `staff` and `developer`.

## Scoped index for course material (if built)

- **Metadata per chunk:** `university_id`, `course_id`, `material_id` or `chapter_id`, `updated_at`.
- **Filter at query time.**
  - The filter values come from **the user's current enrolments and mentorships**, fetched live (`GET /api/courses/student` or `/teaching/overview`). They never come from the question text.
  - A student retrieves only chunks of courses they are **enrolled** in. Class membership is not enough ([03](03_ROLES_PERMISSIONS.md#students-enrolment-decides-course-access)).
  - Every query also filters by `university_id`, with no exception for any role except the platform owner.
- **Re-indexing.** A course's material is re-indexed when a chapter or material is created, updated or deleted (`/api/chapters`, `/api/materials`). Removed items are deleted from the index.

## Citations

- Every answer from static knowledge cites `doc#anchor`. Example: "[04b](04b_WORKFLOWS_TEACHING_AND_LEARNING.md#courses-and-enrolment)".
- Answers from live tools say where the data came from ("your attendance record") and when it was fetched.
- Course-material answers cite the chapter or material title.

## Missing or conflicting evidence

- **No relevant chunk:** say the information is not available. Do not answer from general knowledge as if it were LMS policy.
- **A chunk marked Gap or Inferred:** say it is uncertain.
- **A static document disagrees with a live tool result:** trust the live result for the user's own data, and flag that the documentation may be outdated.
- **Two documents disagree:** prefer the one with the newer `analysed_on` date and Verified status, and mention the conflict ([07](07_BUSINESS_RULES_AND_GLOSSARY.md#contradictions-noticed) lists the known ones).

## Preventing leaks across students and schools

1. The chatbot backend calls tools with the **user's** token. It never uses a shared admin token.
2. Index filters (`university_id`, `course_id`) are set by the server from the session, never by the model.
3. Responses that contain personal data are not cached across users.
4. Conversation memory is per user and is not used for retrieval by other users.
5. Logs keep tool names and status codes, not full personal payloads.

## Updating the knowledge base

- **When to update:** re-run the analysis, or update the affected section, when:
  - routes change (`server/routes`, `config/accessPolicy.js`);
  - the schema changes (`config/sqlite-db.js`, AI module migrations);
  - business rules change (helpers and controllers named in the documents).
- **Regenerating the route list:** the route table in [05](05_API_REFERENCE.md) was generated from the route files. Regenerate it rather than editing it by hand.
- **Re-indexing:** after every documentation change, re-index the changed files and bump `analysed_on`.
