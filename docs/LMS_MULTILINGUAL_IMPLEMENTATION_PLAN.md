# Core5 LMS 20-Language Multilingual (i18n) Implementation Plan

**Date**: 2026-10-22  
**Target Scope**: Expansion from English (`en-IN`) and Hindi (`hi-IN`) to 20 Scheduled/Recognized Indian Languages.

---

## 1. Objectives & Scope

Extend the existing zero-reload `i18next` architecture across all LMS portals (Public, Student, Mentor, Admin, SuperAdmin, Accountant, Storekeeper, Vendor, Chatbot, Onboarding Tours) to support 20 Indian languages while strictly preserving:
- Existing route structures, RBAC, authentication, and database schemas.
- Hero headline and subtitle on the landing page in English (*"Learning that moves everyone forward."*).
- Dynamic user-generated content (student names, classroom names, course titles) in original un-mutated form.
- Existing API contracts (`GET` & `POST /api/user/language-preference`, `x-language` header).
- Zero-reload language switching and preference synchronization.

---

## 2. Target 20 Languages Specification

| # | Language | Locale Code | Legacy / Short | Script Family | Direction | Native Name | Primary Font Stack |
|---|:---|:---:|:---:|:---:|:---:|:---|:---|
| 1 | **English** | `en-IN` | `en` | Latin | `ltr` | English (India) | Inter, Poppins, Plus Jakarta Sans |
| 2 | **Hindi** | `hi-IN` | `hi` | Devanagari | `ltr` | हिन्दी | Noto Sans Devanagari |
| 3 | **Bengali** | `bn-IN` | `bn` | Bengali | `ltr` | বাংলা | Noto Sans Bengali |
| 4 | **Telugu** | `te-IN` | `te` | Telugu | `ltr` | తెలుగు | Noto Sans Telugu |
| 5 | **Marathi** | `mr-IN` | `mr` | Devanagari | `ltr` | मराठी | Noto Sans Devanagari |
| 6 | **Tamil** | `ta-IN` | `ta` | Tamil | `ltr` | தமிழ் | Noto Sans Tamil |
| 7 | **Gujarati** | `gu-IN` | `gu` | Gujarati | `ltr` | ગુજરાતી | Noto Sans Gujarati |
| 8 | **Kannada** | `kn-IN` | `kn` | Kannada | `ltr` | ಕನ್ನಡ | Noto Sans Kannada |
| 9 | **Malayalam** | `ml-IN` | `ml` | Malayalam | `ltr` | മലയാളം | Noto Sans Malayalam |
| 10 | **Punjabi** | `pa-IN` | `pa` | Gurmukhi | `ltr` | ਪੰਜਾਬੀ | Noto Sans Gurmukhi |
| 11 | **Odia** | `or-IN` | `or` | Odia | `ltr` | ଓଡ଼ିଆ | Noto Sans Oriya |
| 12 | **Assamese** | `as-IN` | `as` | Bengali-Assamese | `ltr` | অসমীয়া | Noto Sans Bengali |
| 13 | **Urdu** | `ur-IN` | `ur` | Perso-Arabic (Nastaliq) | `rtl` | اردو | Noto Nastaliq Urdu, Noto Sans Arabic |
| 14 | **Sanskrit** | `sa-IN` | `sa` | Devanagari | `ltr` | संस्कृतम् | Noto Sans Devanagari |
| 15 | **Kashmiri** | `ks-IN` | `ks` | Perso-Arabic (Naskh) | `rtl` | کٲشُر | Noto Nastaliq Urdu, Noto Sans Arabic |
| 16 | **Nepali** | `ne-IN` | `ne` | Devanagari | `ltr` | नेपाली | Noto Sans Devanagari |
| 17 | **Konkani** | `kok-IN` | `kok` | Devanagari | `ltr` | कोंकणी | Noto Sans Devanagari |
| 18 | **Manipuri** | `mni-IN` | `mni` | Bengali / Meetei Mayek | `ltr` | মৈতৈলোন্ | Noto Sans Bengali, Noto Sans Meetei Mayek |
| 19 | **Bodo** | `brx-IN` | `brx` | Devanagari | `ltr` | बर' | Noto Sans Devanagari |
| 20 | **Santali** | `sat-IN` | `sat` | Ol Chiki | `ltr` | ᱥᱟᱱᱛᱟᱲᱤ | Noto Sans Ol Chiki |

---

## 3. Architectural Enhancements

### 3.1 Single Source of Truth (`languageRegistry.js`)
Expand `SUPPORTED_LANGUAGES` with comprehensive metadata for all 20 languages:
- `code`: Standard BCP-47 locale (e.g., `bn-IN`, `ur-IN`).
- `legacyCode`: 2-3 letter code (e.g., `bn`, `ur`, `kok`, `sat`).
- `name`: English display name.
- `nativeName`: Endonym in authentic native script.
- `dir`: `'ltr'` or `'rtl'`.
- `script`: Associated Indic/Arabic script family.
- `fontFamily`: Recommended font stack.
- `ACTIVE_LANGUAGES`: List of all 20 registered locales.

### 3.2 Dynamic RTL and Script Handling (`App.jsx` & `index.css`)
- In `App.jsx`, dynamically update:
  - `document.documentElement.lang = currentLangMeta?.legacyCode || 'en';`
  - `document.documentElement.dir = currentLangMeta?.dir || 'ltr';`
- In `index.css`:
  - Provide `:lang(...)` font family fallbacks for each script.
  - Implement bidirectional RTL utilities for Urdu and Kashmiri (`[dir="rtl"]`).
  - Protect glyph conjuncts for all Indic scripts with `letter-spacing: normal !important`.

### 3.3 Scalable Language Dropdown (`UniversalLanguageSelector.jsx`)
- Group languages logically or provide a scrollable, searchable list (`max-h-80 overflow-y-auto`).
- Display both Native Name and English name for immediate recognition.
- Support RTL layout alignment when active language is Urdu or Kashmiri.

### 3.4 Locale-Aware Formatting (`formatters.js`)
- Update `getLocaleCode` to resolve any valid locale from `normalizeLanguageCode`.
- Leverage native `Intl.NumberFormat(locale, { style: 'currency', currency: 'INR' })` and `Intl.DateTimeFormat(locale)` across all 20 BCP-47 codes.

---

## 4. Translation Dictionary Strategy

### 4.1 Namespace Structure
All 20 locales will maintain the 7 standard namespaces:
1. `common.json` (1,189 keys)
2. `navigation.json` (42 keys)
3. `dashboard.json` (59 keys)
4. `forms.json` (294 keys)
5. `notifications.json` (62 keys)
6. `tours.json` (89 keys)
7. `chatbot.json` (41 keys)
**Total keys per language**: 1,776 keys.  
**Total target keys across 20 languages**: 35,520 entries.

### 4.2 Translation Pipeline & Quality Tiers
- **Tier 1 (Complete & Fully Verified)**:
  - English (`en-IN`) - Baseline (100%)
  - Hindi (`hi-IN`) - Verified Devanagari (100%)
- **Tier 2 (Core Indian Regional Languages)**:
  - Bengali (`bn-IN`), Telugu (`te-IN`), Marathi (`mr-IN`), Tamil (`ta-IN`), Gujarati (`gu-IN`), Kannada (`kn-IN`), Malayalam (`ml-IN`), Punjabi (`pa-IN`), Odia (`or-IN`), Urdu (`ur-IN`).
- **Tier 3 (Additional Official & Classical Languages)**:
  - Assamese (`as-IN`), Sanskrit (`sa-IN`), Kashmiri (`ks-IN`), Nepali (`ne-IN`), Konkani (`kok-IN`), Manipuri (`mni-IN`), Bodo (`brx-IN`), Santali (`sat-IN`).

### 4.3 Validation Suite (`verify_i18n.js`)
Extend the audit tool to validate all 20 languages:
- Check existence and JSON syntax of all 140 files (20 locales × 7 namespaces).
- Check 100% key parity against `en-IN`.
- Verify interpolation variables (`{count}`, `{name}`, etc.) consistency.
- Detect empty translation strings.
- Detect untranslated English fallbacks per language.
- Generate precise per-language completion statistics.
