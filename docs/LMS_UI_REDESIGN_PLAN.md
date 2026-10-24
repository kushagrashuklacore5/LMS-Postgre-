# LMS UI Redesign Plan

Date: 22 October 2026
Based on: `LMS_UI_AUDIT.md`. Finding IDs such as R1 and section references point there.
Constraints: no changes to business logic, API contracts or database schema. Read `LMS_FUNCTIONALITY_PROTECTION.md` before starting any phase.

## 0. Principles

1. **Presentation-only changes by default.** Each redesign change replaces markup and styling around existing state, effects and API calls. A page's `useEffect`/`fetch`/`axios` code moves as-is, or stays where it is.
2. **Strangler approach, not a rewrite.** Build the new shell and components next to the old ones. Then switch one portal at a time behind the existing exports (`AdminLayout`, `MentorLayout`, …), so `App.jsx` and the pages keep working at every step.
3. **Edit the routed file only.** About 47 unreferenced siblings exist (audit 1.5). Before touching a page, confirm in `App.jsx` (or `StorekeeperDashboardSimple.jsx` for the storekeeper) which file is actually rendered.
4. **Translate while you touch.** Any string a redesign step rewrites is moved to a translation key in both `en-IN` and `hi-IN` in the same change.
5. **Fix behaviour only with a recorded decision.** Items that are bugs rather than styling (section 9) are listed for a decision and are not fixed silently inside a redesign commit.

---

## 1. Recommended UI architecture

```
src/
  design-system/            NEW: no business logic, no API calls
    tokens.css              CSS custom properties (colours, radius, shadow, spacing, fonts)
    components/             Button, IconButton, Card, StatCard, Badge, Tabs, Field/Input/Select,
                            Modal, ConfirmDialog, Drawer, DataTable, EmptyState, ErrorState,
                            Skeleton, Spinner, PageHeader, Toolbar, Pagination, Avatar, Tooltip
    feedback/notify.js      thin wrapper over react-toastify (already installed)
  shell/                    NEW
    PortalShell.jsx         sidebar + topbar + drawer + content slot + chatbot slot
    navConfig.js            one nav definition per role (paths, i18n keys, icons, tour ids, groups)
    ErrorBoundary.jsx       per-portal boundary with retry
  components/
    AdminLayout.jsx …       KEPT, re-implemented as <PortalShell portal="admin">{children}</PortalShell>
    Chatbot/                services UNCHANGED; new UI components alongside (section 6)
```

Key decisions:

- **Keep Tailwind.** It is already used everywhere. Add semantic token names in `tailwind.config.js` that map to CSS variables (`bg-surface`, `text-ink`, `bg-brand`, `border-line`, `text-accent`). Keep the existing `primary`/`secondary` keys, because pages that use `bg-primary` today must not change colour by accident. Existing arbitrary hex classes keep working while pages migrate.
- **No new component library is required.** Build the roughly 20 primitives above on Tailwind, `lucide-react` (already used) and `clsx` + `tailwind-merge` (both already installed). This adds no dependency risk. Adding a headless library for accessible dialogs, menus and tabs (Radix UI or Headless UI) is optional and **needs approval**, since it is a dependency change.
- **PortalShell keeps the existing layout contract.** Each `XLayout` keeps its default export and its `{ children }` prop, so the 80+ pages that wrap themselves need no edits to get the new shell.
- **Layout routes (optional, later).** Moving to nested layout routes in `App.jsx` (`<Route element={<PortalShell/>}><Route path=…/></Route>`) would stop the shell remounting on every navigation and would keep chatbot conversations alive. It touches every route, so it is planned as a separate, late phase (P7) with its own regression pass.

---

## 2. Reusable design system

### 2.1 Tokens (one source of truth, in `tokens.css`, mapped into Tailwind)

The values below codify the current gold and navy theme, which recent commits deliberately moved towards. If a different visual direction is chosen, only these values change.

| Token | Value (current theme) | Replaces |
|---|---|---|
| `--color-brand` (navy) | `#002366` | `#002366`, `#1e1b4b` used inconsistently for sidebars |
| `--color-brand-ink` | `#1e1b4b` | heading text |
| `--color-accent` (gold) | `#B99652`, hover `#a38243` | `#B99652`, `#a68443`, `#9a7837` and similar |
| `--color-accent-soft` | `#fff8e7` | `#fff8e7`, `#fffdf4` panels |
| `--color-surface` / `--color-canvas` | `#ffffff` / `#fffdf4` | page backgrounds |
| `--color-line` | `#ebdcaa` | borders |
| `--color-muted` | ≥ 4.5:1 contrast on its background | `text-white/50`, `#7a809c` |
| `--color-success/warning/danger/info` | AA-compliant set | ad-hoc green, amber and red |
| `--radius-*` | one scale. Pick square (`0`) **or** rounded; do not mix | `rounded-none` alongside `rounded-xl`/`2xl` |
| `--font-sans` | `'Plus Jakarta Sans', 'Noto Sans Devanagari', system-ui, sans-serif` | 5 font stacks |
| `--font-display` | `'DM Serif Display', 'Noto Serif Devanagari', serif` | DM Serif usages that `index.css` currently cancels |
| spacing, shadow, z-index scale | named levels: `z-sidebar`, `z-drawer`, `z-modal`, `z-toast`, `z-chatbot` | today z-30/40/50 collide (chatbot z-40 = sidebar z-40) |

Remove the global `h1…h6 { … !important }` rule only when the token fonts are in place. This is a visible change to every heading, so it needs a screenshot comparison.

### 2.2 Components (required behaviour)

| Component | Must provide |
|---|---|
| `Button` / `IconButton` | variants (primary/secondary/ghost/danger), sizes, `loading`, `disabled`; `IconButton` **requires** `aria-label` |
| `Modal` / `Drawer` | `role="dialog"`, `aria-modal`, labelled title, focus trap, focus return, Escape, scroll lock, full-screen on <640px |
| `ConfirmDialog` + `useConfirm()` | promise-based replacement for `window.confirm`, same yes/no semantics, so callers keep their branching |
| `notify.success/error/info` | wraps the existing `toast`, so the 42 `alert()` files can migrate with a one-line change |
| `DataTable` | column config, horizontal-scroll wrapper, sticky header, optional card view on <640px, built-in loading/empty/error rows. Sorting, filtering and pagination remain **the page's existing logic**, passed in as props. |
| `PageHeader` | title (with `<h1>`), breadcrumb, primary actions slot; feeds `document.title` |
| `StatCard` | label, value, delta, icon. Used by every dashboard. |
| `EmptyState`, `ErrorState` (with retry callback), `Skeleton` | one pattern per state across all portals |
| `Field` | label, hint, error, required marker, `aria-describedby`; wraps native inputs so form state code is untouched |

Each component ships with English and Hindi fixtures for its own strings (for example the Close button and "No results") from a `ui` namespace.

---

## 3. Navigation and layout improvements

### 3.1 One shell for all portals

`PortalShell` provides:

- a collapsible desktop sidebar (≥1024px) whose collapsed state persists in localStorage per portal;
- a topbar with the page title, language selector, announcement bell, GuideBot launcher and a user menu (profile, logout);
- a mobile drawer (<1024px) with a labelled hamburger button;
- `aria-current="page"` on the active link;
- a skip-to-content link;
- the chatbot slot;
- a per-portal ErrorBoundary.

Features are switched on per portal through `navConfig`, so a portal never loses a feature because a copy was missed (audit 3.9).

### 3.2 Proposed information architecture

These are proposals; every route stays the same, and only grouping and labels change.

| Portal | Proposed sidebar groups |
|---|---|
| SuperAdmin | Overview · **Institutes** (List, Add) · **Staff** (All, Add) · Demo Leads · Subscription. Keep the `?tab=` URLs; render them as real nav items with an active state. |
| Admin | Dashboard · **People** (Users, Add Student, Add Teacher, Import Students, Mentor Approval*) · **Academics** (Courses, Classrooms, Calendar) · **Finance** (Fee Structure) · **Reports** (Analytics*, Database Export) · Announcements. *Routes that exist today but are missing from the sidebar. |
| Mentor | Dashboard · **Teaching** (My Classrooms, Attendance, Class Results, AI Assessments, Assignments) · Requirements · Fee Monitoring* · Calendar. Courses are reached from classroom cards, as today. |
| Student | Dashboard · **Learning** (Courses, My Tests, Assignments, Certificates*) · **Progress** (Results, Attendance) · Timetable* · Calendar · Fees. |
| Accountant | Dashboard · **Fees** (Collection, Monitoring, Payment History*, Legacy Reconciliation) · **Payables** (Vendor Invoices, Expenses) · Reports. |
| Storekeeper | **Dashboard** (fixes R6: point the nav at the existing `WelcomeStorekeeper` index route) · Inventory · Vendors · Requirements · Reports. "Vendor Stock" currently shows the same page as "Vendors"; it needs a decision. |
| Vendor | Dashboard · **Requests**† · Orders · Invoices · Payments · Stock · **Profile**†. †These pages exist but are unrouted (audit 1.5). Routing them is a functional change that needs approval. |

Starred items (`*`) already have routes. Adding them to the nav is a presentation change, but each should still be confirmed as intended for that role.

### 3.3 Page template

Every page uses: `PageHeader` (title, actions) → optional filter `Toolbar` → content built from `Card`, `DataTable` and `StatCard` → standard states. The maximum content width (`max-w-7xl`) and gutters come from the shell, not from each page.

---

## 4. Responsive design strategy

| Breakpoint | Shell | Content |
|---|---|---|
| <640px (phone) | topbar + drawer; chatbot opens as a full-screen sheet | single column; tables switch to cards or scroll horizontally with the first column sticky; modals go full-screen; 44px minimum touch targets |
| 640–1023px (tablet) | topbar + drawer (closes the current Student and Mentor gaps) | 2-column grids; tables scroll horizontally |
| ≥1024px | sidebar (collapsible) + topbar | multi-column dashboards |

Rules:

- No dynamic Tailwind class names (`lg:ml-${x}`). Use full literal class names or CSS variables.
- Replace the root `h-screen overflow-hidden` with a shell-owned scroll container, and verify every page scrolls. This is checklist item UI-3 in the protection doc.
- Test at 360, 768, 1024 and 1440px in English **and** Hindi. Hindi is the more likely of the two to overflow.

---

## 5. English/Hindi support strategy

Keep i18next, the http backend, the detector, the registry, `TranslationContext` and the `useTranslation` hook signatures. Nothing is reinstalled or replaced.

| Step | Action | Risk |
|---|---|---|
| 5.1 | **Fix document attributes.** Set `<html lang>` and `dir` from `languageRegistry` (`hi-IN` gives `lang="hi"`, `ltr`) instead of the `'ar'` check in `App.jsx`. | Low |
| 5.2 | **Add a Devanagari font.** Add Noto Sans Devanagari (and optionally Noto Serif Devanagari) to the existing Google Fonts `<link>` and to the token font stacks. Avoid `uppercase` and `tracking-*` on translated labels, or apply them only `:lang(en)`. | Low (visual) |
| 5.3 | **Migrate the legacy dictionary.** For the 292 keys used in code that resolve only through `EN_TRANSLATIONS`, copy them into the right JSON namespace in `en-IN` (same English text) and add Hindi translations in `hi-IN`. Keys stay the same, so callers do not change. Then do the same for the 27 unresolved keys. | Low; translations need a native-speaker review |
| 5.4 | **Add namespaces for the untranslated portals:** `vendor`, `accountant`, `storekeeper`, `superadmin`, `assessments`, `ui` (design-system strings). Register them in `NAMESPACES`. | Low |
| 5.5 | **Extract strings portal by portal** inside the redesign phases (principle 4). Toasts use keys too. API `message` text from the server stays as-is for now; show it inside a translated wrapper ("Could not save: {{detail}}"). | Medium (volume) |
| 5.6 | **Add tooling.** Add a dev-only `missingKeyHandler` that warns in the console. Add a script (an `npm run i18n:check` script is a package.json change, so it needs approval; otherwise a standalone Node script under `scripts/`) that fails when (a) en-IN and hi-IN keys differ, (b) a `t('literal')` key resolves nowhere, or (c) a key is only in `EN_TRANSLATIONS`. The script used for this audit is the starting point. | Low |
| 5.7 | **Retire the legacy dictionaries later.** Once 5.3 is complete, the `EN_TRANSLATIONS` fallback is unused, and the never-read `AR_`/`UR_TRANSLATIONS` (about 3,170 lines) can be deleted with approval. | Low, after verification |
| 5.8 | **Locale formatting.** Use `Intl.NumberFormat('en-IN' / 'hi-IN', { style: 'currency', currency: 'INR' })` and `Intl.DateTimeFormat` through one helper. The existing `formatInr` in `pages/accountant/reportData.js` should be reused or wrapped, not duplicated. | Low |
| 5.9 | **Persist the preference.** The `POST /user/language-preference` call already exists. Reading it back on login (the `GET` exists on the server) is a small additive change that needs approval. | Low |

**Layout rules for Hindi:** no fixed-width text containers without wrapping; `min-w-0` with wrapping (not `truncate`) on nav labels and chips; table headers may wrap to two lines; buttons grow to fit their text.

---

## 6. New chatbot UI integration strategy

**Goal:** replace the chatbot's look without changing its data behaviour.

### 6.1 Adapter boundary

The three service modules (`chatbotService.js`, `mentorChatbotService.js`, `adminChatbotService.js`) are treated as the chatbot backend and **are not edited** in the UI phase. Their 52 passing tests are the safety net.

```
Old:  LMSChatbot.jsx  → service.handleMessage(text, {API, token, user}) → HTML string
New:  ChatbotProvider (state, role → service, auto-open)   ← logic moved verbatim from LMSChatbot.jsx
        └ ChatLauncher / ChatPanel / MessageList / Composer / QuickChips   ← new UI only
```

- The new `ChatbotProvider` keeps the **exact behaviour** of `LMSChatbot.jsx` lines 36–170:
  - the role → service mapping;
  - `isAuthorized` (exact `user.role` match);
  - auto-open through `service.shouldAutoOpen`/`markAutoOpened` with the same localStorage keys;
  - a greeting that refreshes on language change;
  - chip messages sent as the same English strings;
  - `maxLength 300`;
  - the error fallback text.
- Assistant messages remain **HTML strings from the services**, rendered with `dangerouslySetInnerHTML` (escaping is done and tested in the services). The new UI styles the classes the services emit (`card`, `tbl`, `badge`, `hint`) through a scoped CSS block, so the services need no edits.
- `LMSChatbot` keeps its default export and `role` prop, and renders the new UI internally. The three layouts need no change, and later the shell's chatbot slot renders it.
- Visual direction: use design-system tokens (removing the off-theme purple), a full-screen sheet on phones, real focus management, and the motion design (keyframes) moved into CSS rather than an inline `<style>` per render.

### 6.2 Using `LMSChatbot 7.jsx` as the visual source

Take only the presentation: panel layout, bubbles, chips and the multi-step chip flow. Do **not** copy its mock `DB`, its role switcher or its write actions (create announcement or event). Those would be new features needing new API calls and permission checks, outside this redesign.

### 6.3 Later options, each needing approval

| Option | Change type |
|---|---|
| Show the chatbot to `teacher`-role users in the Mentor portal | behaviour (authorization display) |
| Add the chatbot to the Accountant, SuperAdmin, Storekeeper and Vendor portals | new service modules (new feature) |
| Answer in Hindi: route the service text through i18n keys and add Hindi keywords to `detectIntent` | service logic change, with updated tests |
| Keep the conversation across page navigation | depends on layout routes (P7) or provider state lifted above routes |
| Structured message objects instead of HTML strings | service and test change |

---

## 7. Implementation phases and dependencies

| Phase | Content | Depends on | Exit criteria |
|---|---|---|---|
| **P0 Baseline** | Create a branch. Capture screenshots of every routed page per role at 360, 768 and 1440px in English and Hindi (chrome-devtools MCP is available). Run the full regression checklist once against the current UI and record the results. Run the chatbot and AI-module tests. | none | Baseline recorded; known failures listed so they are not blamed on the redesign |
| **P1 Foundations** | `tokens.css`, Tailwind semantic tokens (additive), Devanagari font, `design-system/components`, `notify`, `useConfirm`, ErrorBoundary. No page changes. | P0 | Components render in both languages; no visual change to existing pages |
| **P2 Shell** | `PortalShell` + `navConfig`. Re-implement the six layouts and the storekeeper sidebar as thin wrappers. Mobile drawer for every portal. `<html lang>` fix. `aria-current`. | P1 | Every portal is navigable at 360/768/1024px; all routes still reachable; regression checklist sections A and B pass |
| **P3 i18n foundation** | Steps 5.3, 5.4 and 5.6 (legacy keys to JSON, new namespaces, check script). | P1 (it can run in parallel with P2) | Check script reports 0 unresolved and 0 legacy-only keys among those already used |
| **P4 Portal pages** | Redesign page by page: markup to design-system components, plus string extraction. Suggested order: **Student → Mentor → Admin → Accountant → Storekeeper → Vendor → SuperAdmin → Public/Auth**. This order puts daily-use portals and payment and grade flows (high regression cost) early, while attention is highest. | P2, P3 | Per portal: the protection checklist section for that portal passes in English and Hindi; the screenshot comparison is reviewed |
| **P5 Chatbot UI** | Section 6.1. | P1 (P2 for the shell slot) | 52 service tests pass; manual chatbot checklist passes for the student, mentor and admin roles |
| **P6 Tours** | Re-anchor `data-tour` attributes on redesigned pages (282 exist today). Namespace tour copy keys by tour ID so step-ID collisions cannot occur (a small runtime change that needs approval). Add the student launcher. Translate the overview tours. | P4 for the pages concerned | Every tour step finds its target in both languages |
| **P7 Optional structural** | Layout routes in `App.jsx`; persistent chatbot; delete dead files (audit 1.5) **only with approval**. | P2–P6 | Full regression pass |

The phases are deliberately small enough to ship separately. Each one leaves the app releasable.

---

## 8. Effort hotspots

These are the largest routed files, where redesign is costliest and regressions are most likely. Plan these as separate tasks:

- `SuperAdminDashboard.jsx` (1,621 lines)
- `StudentImport.jsx` (1,843)
- `CourseTeacherPortal.jsx` (1,525)
- `Home.jsx` (1,292)
- `CourseViewer.jsx` (1,164)
- `FeeStructure.tsx` (1,116)
- `PayFees.jsx` (939)
- `ClassroomDetail.jsx` (857)
- `TeacherAssessments.jsx` (764)
- `VendorInvoiceManagement.jsx` (762)

---

## 9. Decisions needed before or during the redesign

These are not styling changes. Each needs an owner's decision, and none will be fixed silently in a redesign commit.

| # | Item (audit ref) | Options |
|---|---|---|
| D1 | Duplicate `/mentor/course/:courseId` (R1) | Which component is intended? Give the other its own path or retire it. |
| D2 | Unprotected superadmin and internal routes (R2) | Wrap them in `ProtectedRoute requiredRole="superadmin"` (needs a check of the superadmin login flow). |
| D3 | No 404 page (R4); `/test-terms` debug route (R5) | Add a NotFound page inside the shell; remove the debug route. |
| D4 | Storekeeper landing (R6) | Add a `dashboard` index route pointing at the existing `WelcomeStorekeeper`. |
| D5 | Vendor Requests and Profile unrouted (audit 1.5) | Route them and add them to the nav (functional; the backend endpoints exist). |
| D6 | `PayFees` hardcoded ₹8,050 fallback (audit 3.5) | Show an error state instead of default figures (changes visible behaviour on a payment page). |
| D7 | Calendar and Announcements outside the shell (R9) | Render them inside the role's shell. |
| D8 | Chatbot for `teacher` role and for other portals (section 6.3) | as listed |
| D9 | Visual direction | Keep the current gold and navy theme (assumed in section 2.1), or choose a new one. One corner-radius rule. |
| D10 | Dead-file removal (audit 1.5) | Approve a deletion list after P4. |
| D11 | Dependencies | Approve or reject a headless UI library and a `package.json` i18n check script. |
