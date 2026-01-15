# Audible Library Creator

An Obsidian plugin that creates rich Book notes in your vault by scraping Audible book pages.

Given an Audible URL, the plugin extracts structured metadata (title, author, series, book number, cover image, description, and tags) and generates a Markdown note using your own template — designed to integrate cleanly with Dataview-based libraries and daily reading workflows.

---

## ✨ Features

- 📚 Create Book notes directly from Audible URLs
- 🧠 Extracts:
  - Title
  - Author (with Audible author link)
  - Series + book number (when available)
  - Cover image
  - Description
  - Categories and tags
- 🧩 Uses a configurable **Book template**
- 🗂 Writes notes into your chosen category folder
- 🧾 YAML frontmatter compatible with Dataview
- 🧪 Desktop-only (Audible scraping requires desktop)

---

## 📦 Installation

### Community Plugins (future)
_Not yet listed._  
Once approved, you’ll be able to install this from **Settings → Community Plugins**.

### Manual Installation (recommended for now)

1. Download the latest release from GitHub
2. Extract into:
3. Ensure the folder contains:
 - `main.js`
 - `manifest.json`
4. Restart Obsidian or reload plugins
5. Enable **Audible Library Creator** in Community Plugins

---

## ⚙️ Configuration

Open **Settings → Audible Library Creator** to configure:

- **Book Template Path**  
Path to your `BookTemplate.md` (relative to vault root)  
Example:

- **Books Root Folder**  
Base folder where Book notes will be created  
Example:

- **Default Category**
Used when no category is specified (e.g. `Fiction`)

---

## 🚀 Usage

1. Open the **Command Palette**
2. Select:
3. Paste an Audible book URL  
Example:
4. Choose or enter a category
5. The plugin will:
- Scrape Audible
- Fill your template
- Create the book note in your vault

---

## 🧾 Template Requirements

Your Book template can contain placeholders for:

- YAML frontmatter fields
- Markdown content
- Dataview expressions (e.g. `=default(this.title, "—")`)

Example fields commonly used:
```yaml
type: book
title:
author:
series:
book:
category:
status:
acquired:
source:
rating:
tags:

The plugin does not hardcode layout — your template controls presentation.

🧠 Known Notes

- Audible pages vary slightly; rare edge cases may miss optional metadata
- Dataview fields may briefly show em-dashes (—) until Obsidian finishes indexing
- Scraping relies on Audible’s public HTML and JSON-LD (no login required)

🛣️ Roadmap (planned)

- Series-first creation
- Author page generation
- Multi-book import
- Additional settings
- Optional Goodreads / ISBN support
- Improved error reporting

📜 License
MIT

🙏 Credits

Built by Glen Bland
Waypoint Labs
https://waypointlabs.org/Projects/Obsidian-Plugins/Audible-Library-Creator/index.html
