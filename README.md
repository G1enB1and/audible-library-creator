# Audible Library Creator

An Obsidian plugin that creates rich Book notes in your vault by scraping Audible book pages.

Given an Audible URL, the plugin extracts structured metadata (title, authors, narrators, series, book number, cover image, description, publisher, release date, and tags) and generates a Markdown note using your own template — designed to integrate cleanly with Dataview-based libraries and reading workflows. It can also create pages for Authors and for Book Series. Soon it will even have multiple archive views, filters, and search options to see your collections. 

---

## ✨ Features

- 📚 Create Book notes directly from Audible URLs
- 🧠 Extracts:
    - Title
    - Authors (with links)
    - Narrators (with links)
    - Series and book number (when available - with links)
    - Cover image
    - Description
    - Publisher (with link)
    - Release Date
    - Categories and tags
- 🧩 Uses configurable templates for Books, Authors, Series, and Archives.
- 🗂 Writes notes into your chosen library folders (supports multiple separate libraries)
- 🧾 YAML frontmatter compatible with Dataview
- 🧪 Desktop-only (Audible scraping requires desktop)

---

## 📦 Installation

### Community Plugins (future)

Not yet listed.

Once approved, you’ll be able to install this from  
Settings → Community Plugins.

### Manual Installation (recommended for now)

1. Download the latest release from GitHub
2. Extract it into:  
    `YOUR_VAULT_ROOT/.obsidian/plugins/audible-library-creator/`
3. Ensure the folder contains:
    - main.js
    - manifest.json
4. Restart Obsidian or click Reload plugins
5. Enable Audible Library Creator in Community Plugin

---

## ⚙️ Configuration

Open Settings → Audible Library Creator to configure:

### Paths to Templates
- book-template
- author-template (optional - blank will disable)
- series-template (optional - blank will disable)
- archive-template
### Paths to Books, Authors, Series, and Archives Per Library
- Supports multiple isolated libraries, each with their own paths. Just click Add/Remove Library.
- Authors and Series are optional - just leave blank to disable. (Can vary per library)

### Defaults
- Category, Status, Acquired, Source, Rating

### Features
- View/Hide sidebar ribbon buttons for Create Book, Create Author Page, Create Series Page.
- Overwrite existing Files (Global Preference sets initial toggle state but can still be toggled per file from other menus).
- Toggle to open created files automatically.

### Tags and Category Rules
- Supports JSON to automatically add tags of your choice to different libraries.

### Advanced Importers
- Coming Soon
- Will support bulk imports from your wish list, library page, series pages, and author pages.

---

## 🚀 Usage

1. Open the Command Palette
2. Select: Audible Library Creator: Create Book From Audible
3. Paste an Audible book URL  
    Example: [https://www.audible.com/pd/](https://www.audible.com/pd/)...
4. Choose or enter a specific library if you added multiple
5. The plugin will:
    - Scrape Audible
    - Fill your template
    - Create the book note in your vault

- The steps above apply to Books, Authors, and Series.


---

## 🧾 Template Requirements

I will provide templates as examples that are good enough to use as is, but you're welcome to customize them to your liking. 

Your Book template can contain:

- YAML frontmatter fields
- Markdown content
- Dataview expressions

Example Dataview usage (inline, not a block):  
=default(this.title, "—")

Common YAML fields used by the plugin include:

type  
title  
author  
narrator
series  
book  
publisher
release_date
category  
status  
acquired  
source  
rating  
tags
start_date
finish_date

The plugin does not enforce layout — your template controls presentation.

---

## 🧠 Known Issues & Notes

- Audible pages vary slightly; rare edge cases may miss optional metadata
- Dataview fields may briefly show em dashes (—) until Obsidian finishes indexing
- Scraping relies on Audible’s public HTML and JSON-LD (no login required)


---

## 📜 License

MIT

---

## 🙏 Credits

Built by Glen Bland  
Waypoint Labs

[https://waypointlabs.org/Projects/Obsidian-Plugins/Audible-Library-Creator/index.html](https://waypointlabs.org/Projects/Obsidian-Plugins/Audible-Library-Creator/index.html)

---

