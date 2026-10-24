# LMS AI Knowledge Base: Index

This knowledge base describes how this LMS works, checked against its source code. Its readers are:

- **developers** maintaining the LMS;
- **an LLM assistant** that answers questions about the LMS (through retrieval);
- **a future tool-calling agent** that may use existing LMS APIs on a user's behalf.

It explains the system and points to the code; it does not copy it. It is not user help text and not a security certification.

- **Last analysed:** 16 October 2026 (working tree on branch `security/critical-remediation`, base commit `8946567`).
- **Method and coverage:** [_ANALYSIS_NOTES.md](_ANALYSIS_NOTES.md).

## Confidence labels

| Label | Meaning |
|---|---|
| **Verified** | Read in the implementation; often also covered by an automated test that passed on the analysis date. |
| **Documented** | Stated in comments, READMEs or other docs, but the behaviour was not traced in code. |
| **Inferred** | Follows from the code structure, but no single place states it and it was not tested. |
| **Gap** | Missing, contradictory, broken or unclear. Collected in [12](12_GAPS_AND_OPEN_QUESTIONS.md). |

Statements without a label are Verified.

## Documents

| # | Document | Use it for |
|---|---|---|
| 01 | [Product overview](01_PRODUCT_OVERVIEW.md) | What the LMS does, its roles and portals, its main modules |
| 02 | [System architecture](02_SYSTEM_ARCHITECTURE.md) | Runtime layout, request lifecycle, module dependencies |
| 03 | [Roles and permissions](03_ROLES_PERMISSIONS.md) | Who may do what, and where the server enforces it |
| 04a | [Workflows: accounts and access](04a_WORKFLOWS_ACCOUNTS_AND_ACCESS.md) | Sign-in, sign-out, password reset, creating users, onboarding, schools |
| 04b | [Workflows: teaching and learning](04b_WORKFLOWS_TEACHING_AND_LEARNING.md) | Classes, courses, enrolment, content, assessments, attendance, results, certificates |
| 04c | [Workflows: live classes and notifications](04c_WORKFLOWS_LIVE_CLASSES_AND_NOTIFICATIONS.md) | Online lectures (JaaS), lecture attendance, notifications, announcements |
| 04d | [Workflows: fees, procurement, platform](04d_WORKFLOWS_FEES_PROCUREMENT_PLATFORM.md) | Fees and payments, subscriptions, procurement, platform owner |
| 05 | [API reference](05_API_REFERENCE.md) | Routes, callers, inputs, side effects |
| 06 | [Data model](06_DATA_MODEL.md) | Tables, relationships, ownership, deletion behaviour |
| 07 | [Business rules and glossary](07_BUSINESS_RULES_AND_GLOSSARY.md) | Rules, statuses, terms |
| 08 | [Errors and troubleshooting](08_ERRORS_TROUBLESHOOTING.md) | Common failures and safe checks |
| 09 | [Integrations and configuration](09_INTEGRATIONS_AND_CONFIGURATION.md) | External services, environment variable names |
| 10 | [AI tool catalog](10_AI_TOOL_CATALOG.md) | Proposed agent tools (design only, none implemented) |
| 11 | [RAG knowledge strategy](11_RAG_KNOWLEDGE_STRATEGY.md) | What to index, what to fetch live, how to scope it |
| 12 | [Gaps and open questions](12_GAPS_AND_OPEN_QUESTIONS.md) | Unverified, contradictory or risky areas |
| 13 | [AI grounding rules](13_AI_GROUNDING_RULES.md) | Operating rules for a future LMS chatbot |

## Suggested reading order

- **AI assistant answering "how do I…" questions:** 01 → 07 → the relevant 04 file → 13.
- **Agent designer:** 03 → 05 → 10 → 11 → 13.
- **Developer:** 02 → 03 → 06 → 12.

## Naming used throughout

- **School** is the tenant. In the code it is a row in `universities`, and records carry it as `university_id`. "Tenant" and "school" mean the same thing here.
- **Teacher** is the role stored as `mentor`. Older accounts may store `teacher`; the server treats both as the same role.
- **Class** is a `classrooms` row, a grade plus a section (for example "5-A").
- **Platform owner** is the `superadmin` role, which runs the whole installation and belongs to no school.
