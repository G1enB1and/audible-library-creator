# Implementation Plan — Audible Library Creator

Branch: dev  
Baseline commit: dba4c73 (working state)  
Goal: Implement the next wave of settings + behaviors safely without breaking existing book creation.

This plan is designed for agent-assisted implementation (Codex CLI / Antigravity). It is intentionally incremental and test-driven (manual test URLs) so we don’t regress scraping or template rendering.

---

## 0 Current State Snapshot

### What works today
- Command: Create Book From Audible
- Scrapes Audible book page (public HTML / JSON-LD)
- Writes a Book note using a user template
- Basic settings exist and are saved via settings.ts

### Files of interest
- main.ts: command, scrape, render, write, open file behavior (some features may not be wired yet)
- settings.ts: settings UI + defaults + helpers
- BookTemplate.md: dev template (not necessarily shipped as default template for all users)

### Settings already defined in code (settings.ts)
Paths & Templates
- booksRoot, authorsFolder, seriesFolder, archiveFolder
- bookTemplatePath, authorTemplatePath, seriesTemplatePath, archiveTemplatePath

Defaults
- defaultCategory, defaultStatus, defaultAcquired, defaultSource

Rating
- defaultRatingNumber, ratingStyle, allowHalfStars

Features
- separateCategoriesIntoSubfolders, createArchivesPerSubfolder, createSeriesPages
- openCreatedFile, overwriteIfExists

Tags
- tagRulesJson (JSON)

NOTE: Some settings are present but may not be wired into main.ts behavior yet.

---

## 1 Guiding Principles

- Keep book creation stable: do not break the core command.
- Prefer JSON-LD for parsing metadata whenever possible.
- Don’t “discover tags” from random page text: only use curated rules + a minimal safe set.
- All paths are vault-relative and should be normalized using safeNormalizePath.
- Filenames must be safe on Windows:
  remove forbidden characters and trim, avoid trailing dots/spaces.

---

## 2 Next Milestone Priorities (Recommended Order)

Milestone A — Wire settings into behavior (low risk, immediate value)
Milestone B — Introduce rating rendering helper + store rating as a number (moderate)
Milestone C — Author page scaffolding + link book → author note (moderate)
Milestone D — Series pages scaffolding (optional)
Milestone E — Archive pages (optional)
Milestone F — Importers (higher effort, last)

---

## 3 Milestone A — Wire Settings into Book Creation

### A1 Normalize and validate paths everywhere
Goal: All vault-relative paths are clean and consistent.

Tasks:
- Ensure safeNormalizePath is used for:
  - booksRoot, authorsFolder, seriesFolder, archiveFolder
  - template paths
- In main.ts, when building output paths, normalize final paths:
  - join segments with "/"
  - avoid accidental "//"

Acceptance:
- Creating a book with category "Helpful Informative/Finance" creates subfolders as expected.
- Paths work even if user enters Windows-style slashes.

### A2 Implement overwriteIfExists behavior
Goal: If file exists:
- overwriteIfExists = false → don’t overwrite; instead open existing file (or show notice)
- overwriteIfExists = true → replace contents

Implementation notes:
- In Obsidian API, check vault.adapter.exists(filePath) or vault.getAbstractFileByPath
- If exists and overwrite disabled:
  - optionally open existing file if openCreatedFile is true
  - show Notice: "File exists"
- If overwrite enabled:
  - vault.modify(existingFile, content) OR vault.create + delete (prefer modify)

Acceptance:
- Re-running the same URL doesn’t duplicate notes.
- Behavior matches toggle.

### A3 Implement openCreatedFile behavior
Goal:
- If enabled, open the newly created or existing note automatically.

Implementation notes:
- Use workspace.getLeaf(false).openFile(file)
- Guard against null leaves.

Acceptance:
- Toggle works.

### A4 Apply defaults consistently
Goal:
- If user doesn’t provide category, use defaultCategory.
- If template placeholders include status/acquired/source/rating and plugin is responsible for those values, fill from defaults unless page provides overrides.

Acceptance:
- Creates YAML with defaultStatus/defaultAcquired/defaultSource/defaultRatingNumber when missing.

---

## 4 Milestone B — Ratings: Number Storage + Rendering

Goal:
- Store rating as a number in YAML (example: 3 or 3.5)
- Provide a rendered string for display based on ratingStyle + allowHalfStars

Plan:
- Add helper in a shared util module or in main.ts:
  - clamp rating to 0..5
  - if allowHalfStars false: round to nearest integer (or floor; decide and document)
  - if allowHalfStars true: round to nearest 0.5

Render modes:
- ratingStyle = "emoji"
  - full: "⭐"
  - half: "½" appended OR alternate safe half marker (document it)
  - example 3.5 → "⭐⭐⭐½"
- ratingStyle = "classic"
  - full: "★"
  - half: "⯪" or "½" (choose one consistently)
  - empty: "✰" (optional)
  - example 3.5 → "★★★⯪"

Important:
- YAML should be stable (number), not emoji. Emoji rendering should be done in template/dataview or by writing an extra field.
Options:
1) Write two fields:
   - rating: 3.5
   - rating_display: "⭐⭐⭐½"
2) Or only write rating number and let user templates render it.
Recommendation:
- Write both (rating + rating_display) to make it easy for non-dataview users.

Acceptance:
- rating_display matches settings and rating number.

---

## 5 Milestone C — Author Pages (Scaffold + Link Book → Author)

Goal:
- Book pages should link to Obsidian author pages (eventually replacing Audible author links)
- If author note doesn’t exist, create it from authorTemplatePath.

Tasks:
- Define author note naming convention:
  - "Author - {Author Name}" OR "{Author Name}" under authorsFolder
  - Decide and keep consistent
- When creating a book:
  - determine author name + audible author URL
  - compute author note path
  - if missing, create it using author template
  - in book note, replace author link with internal link:
    - [[Authors/Author Name|Author Name]]
  - author note should contain:
    - name
    - audible author link
    - a section that lists books in vault by querying links or folder scan (future)

Acceptance:
- Creating a book auto-creates author page (if toggle is later added; for now do it unconditionally or behind an existing feature toggle if present).
- Book note links internally to author note.

---

## 6 Milestone D — Series Pages (Optional)

Goal:
- If createSeriesPages is true:
  - create a series note in seriesFolder if missing
  - link book note to series note internally

Series naming:
- "Series - {Series Name}" OR "{Series Name}" under seriesFolder

Acceptance:
- Series note created and linked.

---

## 7 Milestone E — Archives (Optional)

Goal:
- Provide optional archive pages (per category or per folder)
- createArchivesPerSubfolder controls how deep.

Acceptance:
- If enabled, archive note is generated based on archiveTemplatePath.

---

## 8 Milestone F — Importers (Library & Wishlist)

Goal:
- Add commands to:
  - Scrape library page → extract owned book URLs → batch-create notes
  - Scrape wishlist page → extract wishlisted book URLs → batch-create notes with acquired = "Wish Listed"

Requirements:
- Confirm Audible page layout patterns (may vary)
- Add rate limiting + progress notices
- Avoid duplicates
- Provide “dry run” option later (nice-to-have)

Acceptance:
- Batch import creates expected notes.

---

## 9 Testing Checklist (Manual)

Keep 3–5 test URLs in a private dev note (not necessarily committed). Ensure each run validates:
- series present vs absent
- multiple authors (if encountered)
- category with slashes
- overwrite behavior
- author page creation
- rating behavior

For each run confirm:
- YAML parses in Obsidian properties
- template placeholders render after index
- tags are clean (no UI junk)

---

## 10 Suggested Implementation Order (Actionable)

1) Wire overwriteIfExists + openCreatedFile (Milestone A2/A3)
2) Ensure defaults applied for YAML fields (A4)
3) Normalize output paths + category subfolders (A1)
4) Add rating helpers + rating_display (Milestone B)
5) Author page scaffolding + book link rewrite (Milestone C)
6) Series pages toggle behavior (Milestone D)
7) Archives (Milestone E)
8) Importers (Milestone F)

---

## 11 Notes for Agents

- Read settings.ts first; assume settings structure is source of truth.
- Keep changes small and commit frequently.
- Do not rewrite the scraping logic wholesale unless a specific bug demands it.
- Prefer adding helper functions rather than deeply nesting logic in main.ts.
- If a setting is present but not implemented, add a TODO comment and implement in the order above.
