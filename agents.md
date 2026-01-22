# Agents Guide — Audible Library Creator (Obsidian Plugin)

This repo is an Obsidian desktop plugin that creates “Book” notes by scraping Audible book pages (public HTML + JSON-LD) and rendering a user-provided Markdown template with YAML frontmatter.

Primary command:
- "Audible Library Creator: Create Book From Audible" → prompts for Audible URL and category → scrapes data → writes a Markdown note into the Books folder.

Repo owner: Glen Bland (Waypoint Labs)
Branch workflow:
- dev = active development
- main = stable releases

IMPORTANT GOALS
1) Keep the plugin reliable and deterministic.
2) Keep templates user-controlled (plugin provides placeholders + defaults, but doesn’t force layout).
3) Make settings UX clean and scalable (tab/section organization planned).
4) Avoid scraping “noise” (Audible pages contain lots of UI text; parsing must be targeted).

NON-GOALS (for now)
- No login / authenticated scraping.
- No DRM / audio file downloads.
- No “storefront automation.”

TECH STACK / FILES
- main.ts: core plugin logic + command entrypoint + scrape + render + write file
- settings.ts: settings UI + persisted settings
- main.js: compiled output used by Obsidian (built from TS)
- manifest.json: Obsidian plugin manifest
- esbuild.config.mjs: build config
- BookTemplate.md: local example template (for development); Glen will simplify a version of this before submitting to the community plugin store, you can keep his more personalized template while building this for him. He knows what to remove later.
- data.json: optional/dev fixture (if used, keep it out of release assets unless intentional)
- package.json / package-lock.json: build tooling

BUILD / DEV COMMANDS
- npm install
- npm run build

Obsidian loads:
- manifest.json
- main.js

Do not assume Obsidian will load TypeScript directly.

RELEASE PROCESS (LOCAL)
- Ensure build passes and main.js is updated (npm run build)
- Commit changes on dev
- Merge dev → main when stable
- Bump manifest.json version
- Tag release (1.0.0 recommended if submitting to community later; do not add v)
- Create GitHub Release and attach the required assets (typically main.js, manifest.json, styles.css if present)

REQUIRED OUTPUT BEHAVIOR
When creating a book note:
- Must write valid YAML frontmatter.
- Must generate stable tags (no “Audible UI soup”).
- Must properly parse:
  - title
  - canonical url (no query params)
  - cover_url
  - author name + audible author url
  - series name + series url + book number where available
  - description (prefer JSON-LD; fallback to robust extraction)
- Must render template placeholders correctly.
- Must not create malformed file paths or illegal Windows file names.
- Must keep the note filename consistent with the normalized title.

SETTINGS (CURRENT)
Current settings include:
- Book Template Path (relative to vault root)
- Books Root Folder
- Default Category

SETTINGS (PLANNED — STRUCTURE)
Organize settings into sections/tabs:
1) Paths & Templates
2) Defaults
3) Features
4) Tags & Category Rules
5) Advanced / Importers

PLANNED OPTIONS (HIGH PRIORITY)
Paths & Templates
- Books folder path
- Book archive folder path
- Authors folder path
- Series folder path
- Book template path
- Author template path
- Series template path
- Archive template path

Defaults
- Default category
- Default acquired value (Owned / Wishlisted)
- Default status
- Default rating

Features
- Toggle: Open created file automatically
- Toggle: Overwrite if exists
- Toggle: Create author page automatically
- Toggle: Create series page automatically
- Toggle: Separate categories into subfolders
- Toggle: Create archives per subfolder
- Toggle: Half-star ratings

Tags & Category Rules
- Per-category tag rules (JSON editor now; table UI later)
- Base tags (always include)
- Optional extra tags by category and/or folder

Advanced / Importers
- Importer: scrape library page to batch-create “Owned” books
- Importer: scrape wishlist page to batch-create “Wishlisted” books
- Author page population mode:
  - include only books explicitly created in Obsidian
  - or scrape all books from Audible author page (optional)
- Series page population mode:
  - include only books explicitly created in Obsidian
  - or scrape all books from Audible series page (optional)

RATING DISPLAY REQUIREMENTS (PLANNED)
- YAML should store rating as number (example: 3.5) OR a stable representation.
- Overview display should render based on user preference:
  - Stars set 1: emoji stars (⭐⭐⭐)
  - Stars set 2: glyph stars (★★★⯪✰) or similar with a half-step
- Note: emoji set has no perfect half-star; allow ½ or a different symbol in UI.

AUTHOR LINKS REQUIREMENT (PLANNED)
Book pages should eventually link to Obsidian author pages, not Audible author pages.
- If author page doesn’t exist, book creation should create it.
- Author page should include a link back to Audible author page.

SCRAPING GUIDELINES (CRITICAL)
Audible HTML includes tons of UI text. Parsing must:
- Prefer JSON-LD for stable fields.
- Use specific selectors for series/author where possible.
- Avoid selecting all anchors/chips indiscriminately.
- Never treat “page text tokens” as tags.
- Keep URL cleanup (remove query string + fragments).

TESTING / SAFETY
- Include a small set of test URLs (3–5) representing different layouts:
  - with series, without series
  - multiple authors
  - different categories/tags
- Add debug logging behind a setting if needed (do not spam console by default).
- Never write outside the vault root (all user paths should be relative to vault unless explicitly supported).

STYLE / CODE QUALITY
- TypeScript preferred.
- Keep functions small and testable: fetch, parse, normalize, render, write.
- Normalize title once and reuse everywhere.
- Add guardrails for missing fields (graceful fallbacks).
- Avoid introducing new dependencies unless needed.

DEFINITION OF DONE (FOR EACH CHANGE)
- Builds successfully.
- Command produces correct book note for test URLs.
- YAML valid, tags clean, series/author URLs correct.
- Works in Obsidian desktop with plugin reload.

Also read: implementation_plan.md (source of truth for upcoming work)