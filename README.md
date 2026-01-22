# Audible Library Creator

Audible Library Creator is an Obsidian desktop plugin that creates rich Book notes in your vault by scraping Audible book pages.

Given an Audible URL, the plugin extracts structured metadata (title, author, series, book number, cover image, description, and tags) and generates a Markdown note using your own template — designed to integrate cleanly with Dataview-based libraries and reading workflows.

---

## Features

- Create Book notes directly from Audible URLs
- Extracts:
  - Title
  - Author (with Audible author link)
  - Series and book number (when available)
  - Cover image
  - Description
  - Categories and tags (cleaned and normalized)
- Uses a configurable Book template
- Writes notes into your chosen category folder
- YAML frontmatter compatible with Dataview
- Desktop-only (Audible scraping requires desktop)

---

## Installation

### Community Plugins (future)

Not yet listed.

Once approved, you’ll be able to install this from:
Settings → Community Plugins

### Manual Installation (recommended for now)

1) Download the latest release from GitHub  
2) Extract it into:
YOUR_VAULT_ROOT/.obsidian/plugins/audible-library-creator/
3) Ensure the folder contains at least:
- main.js
- manifest.json
4) Restart Obsidian or click Reload plugins  
5) Enable Audible Library Creator under Community Plugins

---

## Configuration

Open:
Settings → Audible Library Creator

Current settings:

Book Template Path  
Path to your BookTemplate.md, relative to the vault root  
Example: Templates/BookTemplate.md

Books Root Folder  
Base folder where Book notes will be created  
Example: Books

Default Category  
Used when no category is specified  
Example: Fiction

---

## Usage

1) Open the Command Palette  
2) Select:
Audible Library Creator: Create Book From Audible
3) Paste an Audible book URL  
4) Choose or enter a category folder name  
5) The plugin will:
- Scrape Audible
- Fill your template
- Create the book note in your vault

---

## Template Requirements

Your Book template can contain:
- YAML frontmatter fields
- Markdown content
- Dataview expressions

Example Dataview usage:
=default(this.title, "—")

Common YAML fields used by the plugin:
type
title
url
author
narrator
series
book
category
status
acquired
source
rating
cover_url
tags

The plugin does not enforce layout — your template controls presentation.

---

## Known Notes

- Audible pages vary slightly; rare edge cases may miss optional metadata
- Dataview fields may briefly show em dashes (—) until Obsidian finishes indexing
- Scraping relies on Audible public HTML and JSON-LD (no login required)

---

## Development

Prerequisites:
- Node.js (LTS recommended)
- npm

Setup:
- npm install
- npm run build

Obsidian loads the compiled output:
- main.js
- manifest.json

Tip:
Keep Obsidian open and use Reload plugins while iterating.

---

## Roadmap (planned)

Settings organization (future):
1) Paths & Templates
2) Defaults
3) Features
4) Tags & Category Rules
5) Advanced / Importers

Planned additions:
- More path options (Books, Archive, Authors, Series, Templates)
- Toggle: Open created file automatically
- Toggle: Overwrite if exists
- Per-category tag rules (JSON editor first; table UI later)
- Create author pages automatically and link book → author (Obsidian), with Audible link on the author page
- Create series pages automatically (optional)
- Half-star rating support and configurable rating display
- Batch importer:
  - scrape your Audible library page for owned books
  - scrape your wishlist page for wishlisted books
- Optional modes:
  - populate author/series pages only from books created in Obsidian
  - or scrape all known books from Audible author/series pages

Future ideas:
- Dynamic gallery views (Dataview/DataviewJS helpers)
- Filter/sort controls for galleries (category/status/acquired/source/author/series/tags/rating)

---

## License

MIT

---

## Credits

Built by Glen Bland  
Waypoint Labs
