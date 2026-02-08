---
type: archive
view: grid        # cards | grid

# Cards Settings
cards_cover_width: 200     # max width of cover column in cards view
cards_gap: 14              # gap between cover + fields

# Grid Settings
grid_columns: 3
grid_gap: 12
grid_fudge: 28
grid_mode: wrap

cover_size: 200        # max width of cover image in grid view

# Display Toggles
show_cover_image: true
show_title: true
show_audible_url: false
show_author: true
show_narrator: false
show_publisher: false
show_category: false
show_series: true
show_book: true
show_length: true
show_release_date: false
show_rating: true
show_status: true
show_acquired: false
show_source: false
show_start_date: false
show_finish_date: true
show_tags: false

tags_style: hashtags   # hashtags | list

# Filters
filter_category: ""
filter_status: ""
filter_author: ""
filter_narrator: ""
filter_publisher: ""
filter_series: ""
filter_source: ""
filter_acquired: ""
filter_tags: []
filter_rating: ">=0"

limit: 200

# Sort
sort_by: "finish_date"
# sort_by options: title | author | series | rating | 
# start_date | finish_date | release_date

sort_dir: "desc"
# sort_dir options: asc | desc

# Search
search: ""
search_fields: ["title","author","series","tags"]
---

# 📚 `=this.file.name`

```dataviewjs
(() => {
  const cfg = dv.current();
  const plugin = app.plugins.plugins["audible-library-creator"];
  const settings = plugin?.settings ?? {};
  const libs = settings.libraries ?? [];

  // ---------- helpers ----------
  const normalizePath = (p) => (p ?? "")
    .toString()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");

  const asArray = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    return [v];
  };

  function renderPlain(v) {
    if (v == null) return "";
    if (Array.isArray(v)) return v.map(renderPlain).join(", ");
    if (typeof v === "object") {
      if (v.path && v.display) return v.display;
      if (v.path) return v.path;
    }
    return String(v);
  }

  const containsCI = (haystack, needle) => {
    if (!needle) return true;
    return String(renderPlain(haystack)).toLowerCase().includes(String(needle).toLowerCase());
  };

  const safeDate = (v) => {
    if (!v) return null;
    if (v instanceof Date) return v;
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const fmtDate = (v) => {
    const d = safeDate(v);
    if (!d) return "";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const dateKey = (v) => {
    const d = safeDate(v);
    return d ? d.getTime() : -Infinity;
  };

  function formatLength(len) {
    if (!len) return "";
    const s = String(len).trim();
    const m = s.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
    if (!m) return s;

    const h = Number(m[1] ?? 0);
    const min = Number(m[2] ?? 0);
    const sec = Number(m[3] ?? 0);

    const parts = [];
    if (h) parts.push(`${h} hr${h === 1 ? "" : "s"}`);
    if (min) parts.push(`${min} min${min === 1 ? "" : "s"}`);
    if (!h && !min && sec) parts.push(`${sec} sec${sec === 1 ? "" : "s"}`);
    return parts.join(" ");
  }

  const parseRatingRule = (rule) => {
    const r = (rule ?? "").toString().trim();
    const m = r.match(/^(>=|<=|>|<|=)?\s*(-?\d+(\.\d+)?)$/);
    if (!m) return { op: ">=", val: 0 };
    return { op: m[1] || "=", val: Number(m[2]) };
  };

  const compareWithOp = (n, op, val) => {
    const x = Number(n);
    if (Number.isNaN(x)) return false;
    if (op === ">=") return x >= val;
    if (op === "<=") return x <= val;
    if (op === ">")  return x >  val;
    if (op === "<")  return x <  val;
    return x === val;
  };

  const ratingStars = (ratingValue) => {
    const r = Number(ratingValue);
    const max = 5;
    const style = settings.ratingStyle || "classic";
    const allowHalf = settings.allowHalfStars ?? true;

    const full = style === "emoji" ? "⭐" : "★";
    const half = style === "emoji" ? "½" : "⯪";
    const empty = style === "emoji" ? "🌑" : "✰";

    const rounded = allowHalf ? Math.round(r * 2) / 2 : Math.round(r);
    const fullCount = Math.floor(Number.isFinite(rounded) ? rounded : 0);
    const hasHalf = allowHalf && Number.isFinite(rounded) && (rounded % 1 !== 0);
    const emptyCount = Math.max(0, max - fullCount - (hasHalf ? 1 : 0));

    return full.repeat(Math.max(0, fullCount)) + (hasHalf ? half : "") + empty.repeat(Math.max(0, emptyCount));
  };

  const encodePlus = (s) => encodeURIComponent(s).replace(/%20/g, "+");
  const narrSearchUrl = (name) => `https://www.audible.com/search?searchNarrator=${encodePlus(name)}`;
  const provSearchUrl = (name) => `https://www.audible.com/search?searchProvider=${encodePlus(name)}`;

  function splitPeople(v) {
    const arr = Array.isArray(v) ? v : String(v ?? "").split(",");
    return arr.map(s => String(s).trim()).filter(Boolean);
  }

  // Internal link helper (clickable in Obsidian)
  function internalLink(parent, displayText, target) {
    const a = parent.createEl("a", { text: displayText });
    a.addClass("internal-link");
    a.setAttr("data-href", target);
    a.setAttr("href", target);
    return a;
  }

  function externalLink(parent, displayText, href) {
    const a = parent.createEl("a", { text: displayText });
    a.setAttr("href", href);
    a.setAttr("target", "_blank");
    a.setAttr("rel", "noopener");
    return a;
  }

  function renderTagsText(val) {
    const tags = asArray(val).map(t => String(t).trim()).filter(Boolean);
    if (!tags.length) return "";
    const style = String(cfg.tags_style || "hashtags").toLowerCase();
    if (style === "list") return tags.join(", ");
    return tags.map(t => {
      const cleaned = t.startsWith("#") ? t.slice(1) : t;
      return `#${cleaned.replace(/\s+/g, "")}`;
    }).join(" ");
  }

  const info = (s) => dv.paragraph(s);

  // ---------- library pairing ----------
  const currentPath = normalizePath(cfg.file.path);
  const library = libs.find(l => normalizePath(l.archivePath) === currentPath);

  if (!library) {
    info(`> [!CAUTION] Library Configuration Required
> This archive file is not currently registered to any library.
>
> **To fix this:**
> 1. Go to **Settings** → **Audible Library Creator**.
> 2. Locate your library in the **Libraries** list.
> 3. Ensure the **Archive path** field matches this file's path exactly: \`${cfg.file.path}\`
> 4. Once matched, this archive will load automatically.`);
    return;
  }

  const booksFolderRaw = library.booksRoot;
  const booksFolder = normalizePath(booksFolderRaw);

  if (!booksFolder) {
    info(`> [!CAUTION] Books Path Missing
> Library **${library.name ?? "(Unnamed Library)"}** does not have a **Books Root** path set.`);
    return;
  }

  // ---------- load books ----------
  let books = dv.pages(`"${booksFolder}"`).where(p => p.type === "book");

  // ---------- filters ----------
  if (cfg.filter_category) books = books.where(b => String(b.category ?? "") === String(cfg.filter_category));
  if (cfg.filter_status)   books = books.where(b => String(b.status ?? "") === String(cfg.filter_status));
  if (cfg.filter_series)   books = books.where(b => String(b.series ?? "") === String(cfg.filter_series));
  if (cfg.filter_source)   books = books.where(b => String(b.source ?? "") === String(cfg.filter_source));
  if (cfg.filter_acquired) books = books.where(b => String(b.acquired ?? "") === String(cfg.filter_acquired));

  if (cfg.filter_author)    books = books.where(b => containsCI(b.author, cfg.filter_author));
  if (cfg.filter_narrator)  books = books.where(b => containsCI(b.narrator, cfg.filter_narrator));
  if (cfg.filter_publisher) books = books.where(b => containsCI(b.publisher, cfg.filter_publisher));

  if (cfg.filter_tags?.length) {
    const wanted = asArray(cfg.filter_tags).map(t => String(t).toLowerCase());
    books = books.where(b => {
      const tags = asArray(b.tags).map(t => String(t).toLowerCase());
      return wanted.every(t => tags.includes(t));
    });
  }

  if (cfg.filter_rating) {
    const rr = parseRatingRule(cfg.filter_rating);
    books = books.where(b => compareWithOp(b.rating, rr.op, rr.val));
  }

  // ---------- search ----------
  const q = (cfg.search || "").trim().toLowerCase();
  const searchFields = asArray(cfg.search_fields?.length ? cfg.search_fields : ["title","author","series","tags"]).map(String);
  if (q) books = books.where(b => searchFields.some(f => String(renderPlain(b[f])).toLowerCase().includes(q)));

  // ---------- sort ----------
  const sortBy = (cfg.sort_by || "title").toString();
  const sortDir = (cfg.sort_dir || "asc").toString().toLowerCase();

  if (["start_date","finish_date","release_date"].includes(sortBy)) {
    books = books.sort(b => dateKey(b[sortBy]), sortDir);
  } else if (sortBy === "rating") {
    books = books.sort(b => Number(b.rating ?? -Infinity), sortDir);
  } else {
    books = books.sort(b => String(renderPlain(b[sortBy])).toLowerCase(), sortDir);
  }

  // ---------- limit ----------
  const lim = Number(cfg.limit ?? 200);
  if (!Number.isNaN(lim) && lim > 0) books = books.limit(lim);

  // ---------- render ----------
  const view = String(cfg.view || "cards").toLowerCase();
  const coverMax = Number(cfg.cover_size ?? 240) || 240;

  info(`✅ **${library.name ?? "Library"}** • Folder: \`${booksFolderRaw}\` • Showing: **${books.length}**`);

  if (view === "cards") {
    // stacked
    for (const b of books) {
      const wrap = dv.el("div", "", {
        attr: {
          style: `
            border: 1px solid var(--background-modifier-border);
            border-left: 4px solid var(--text-accent);
            border-radius: 10px;
            padding: 12px;
            margin: 12px 0;
            background: var(--background-primary-alt);
            box-sizing: border-box;
          `
        }
      });
      renderCardInto(wrap, b, coverMax);
    }
    return;
  }

  if (view === "grid") {
    // Multi-column cards via flex (reliable in Obsidian)
    const cols = Number(cfg.grid_columns ?? cfg.columns ?? 3) || 3;
    const gap = Number(cfg.grid_gap ?? 16) || 16;
    const gridMode = String(cfg.grid_mode || "wrap").toLowerCase(); // wrap | scroll
    const fudge = Number(cfg.grid_fudge ?? 18) || 18;

    // wrapper that neutralizes odd left padding/margins in preview
    const flex = dv.container.createEl("div", {
      attr: {
        style: `
          width: 100% !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
          text-indent: 0 !important;
          display: flex;
          flex-wrap: ${gridMode === "scroll" ? "nowrap" : "wrap"};
          gap: ${gap}px;
          justify-content: flex-start !important;
          align-items: flex-start;
          box-sizing: border-box;
          overflow-x: ${gridMode === "scroll" ? "auto" : "visible"};
          padding-bottom: ${gridMode === "scroll" ? "6px" : "0"};
        `
      }
    });

    const basis =
      gridMode === "scroll"
        ? `calc((100% - ${fudge}px) / ${cols})`
        : `calc((100% - ${(cols - 1) * gap}px - ${fudge}px) / ${cols})`;

    for (const b of books) {
      const cell = flex.createEl("div", {
        attr: {
          style: `
            flex: 0 0 ${basis};
            min-width: 0;
            box-sizing: border-box;
          `
        }
      });

      const card = cell.createEl("div", {
        attr: {
          style: `
            border: 1px solid var(--background-modifier-border);
            border-left: 4px solid var(--text-accent);
            border-radius: 10px;
            padding: 12px;
            background: var(--background-primary-alt);
            box-sizing: border-box;
          `
        }
      });

      renderCardInto(card, b, coverMax);
    }

    return;
  }

  info(`> [!NOTE] Unknown view: \`${cfg.view}\`. Use \`cards\` or \`grid\`.`);

  // ---------- card renderer (pure HTML) ----------
  function renderCardInto(parent, b, coverMaxPx) {
  // ---------- Title (full width) ----------
  if (cfg.show_title) {
    const row = parent.createEl("div", { attr: { style: "margin-bottom: 10px;" } });
    row.createEl("strong", { text: "Title: " });
    internalLink(row, (renderPlain(b.title) || b.file.name || "—"), b.file.path);
  }

  // Cards layout: cover left, fields right (only in cards view)
  const isCards = String(cfg.view || "cards").toLowerCase() === "cards";

  // If no cover OR cover hidden OR not cards view: fall back to simple stack
  const hasCover = !!(cfg.show_cover_image && b.cover_url);

  if (!isCards || !hasCover) {
    // --- Simple stacked layout (same as your current behavior) ---
    if (hasCover) {
      const imgWrap = parent.createEl("div", { attr: { style: "text-align:center; margin: 8px 0 12px;" } });
      const img = imgWrap.createEl("img");
      img.setAttr("src", b.cover_url);
      img.setAttr("style", `width: 100%; height: auto; max-width: ${coverMaxPx}px; border-radius: 6px; display:block; margin:0 auto;`);
    }
    renderFieldsStack(parent, b);
    return;
  }

  // ---------- Two-column layout ----------
  const coverColMax = Number(cfg.cards_cover_width ?? Math.min(coverMaxPx, 180)) || 160;
  const gap = Number(cfg.cards_gap ?? 14) || 14;

  const row = parent.createEl("div", {
    attr: {
      style: `
        display: flex;
        gap: ${gap}px;
        align-items: flex-start;
      `
    }
  });

  // Left: cover
  const left = row.createEl("div", {
    attr: {
      style: `
        flex: 0 0 ${coverColMax}px;
        max-width: ${coverColMax}px;
      `
    }
  });

  const img = left.createEl("img");
  img.setAttr("src", b.cover_url);
  img.setAttr("style", `
    width: 100%;
    height: auto;
    border-radius: 6px;
    display: block;
  `.trim());

  // Right: fields
  const right = row.createEl("div", {
    attr: {
      style: `
        flex: 1 1 auto;
        min-width: 0;
      `
    }
  });

  renderFieldsStack(right, b);

  // ---------- helper: render all visible fields in a stacked way ----------
  function renderFieldsStack(container, b) {
    if (cfg.show_audible_url && b.url) {
      const r = container.createEl("div");
      r.createEl("strong", { text: "Audible: " });
      externalLink(r, "Link", b.url);
    }

    if (cfg.show_author) {
      const r = container.createEl("div");
      r.createEl("strong", { text: "Author: " });
      const names = splitPeople(b.author);
      if (!names.length) r.appendText("—");
      else names.forEach((name, i) => {
        if (i > 0) r.appendText(", ");
        internalLink(r, name, name);
      });
    }

    if (cfg.show_narrator) {
      const r = container.createEl("div");
      r.createEl("strong", { text: "Narrator: " });
      const names = splitPeople(b.narrator);
      if (!names.length) r.appendText("—");
      else names.forEach((name, i) => {
        if (i > 0) r.appendText(", ");
        externalLink(r, name, narrSearchUrl(name));
      });
    }

    if (cfg.show_publisher) {
      const r = container.createEl("div");
      r.createEl("strong", { text: "Publisher: " });
      const pub = String(b.publisher ?? "").trim();
      if (!pub) r.appendText("—");
      else if (pub.includes("http")) externalLink(r, pub, pub);
      else externalLink(r, pub, provSearchUrl(pub));
    }

    if (cfg.show_series && b.series) {
      const r = container.createEl("div");
      r.createEl("strong", { text: "Series: " });
      r.appendText(String(b.series));
    }

    if (cfg.show_book) {
      const r = container.createEl("div");
      r.createEl("strong", { text: "Book: " });
      r.appendText(renderPlain(b.book) || "—");
    }

    if (cfg.show_length) {
      const r = container.createEl("div");
      r.createEl("strong", { text: "Length: " });
      r.appendText(formatLength(b.length) || "—");
    }

    if (cfg.show_release_date) {
      const r = container.createEl("div");
      r.createEl("strong", { text: "Release Date: " });
      r.appendText(fmtDate(b.release_date) || "—");
    }

    if (cfg.show_category) {
      const r = container.createEl("div");
      r.createEl("strong", { text: "Category: " });
      r.appendText(renderPlain(b.category) || "—");
    }

    if (cfg.show_status) {
      const r = container.createEl("div");
      r.createEl("strong", { text: "Status: " });
      r.appendText(renderPlain(b.status) || "—");
    }

    if (cfg.show_rating) {
      const r = container.createEl("div");
      r.createEl("strong", { text: "Rating: " });
      r.appendText(b.rating != null ? ratingStars(b.rating) : "—");
    }

    if (cfg.show_acquired) {
      const r = container.createEl("div");
      r.createEl("strong", { text: "Acquired: " });
      r.appendText(renderPlain(b.acquired) || "—");
    }

    if (cfg.show_source) {
      const r = container.createEl("div");
      r.createEl("strong", { text: "Source: " });
      r.appendText(renderPlain(b.source) || "—");
    }

    if (cfg.show_start_date) {
      const r = container.createEl("div");
      r.createEl("strong", { text: "Start Date: " });
      r.appendText(fmtDate(b.start_date));
    }

    if (cfg.show_finish_date) {
      const r = container.createEl("div");
      r.createEl("strong", { text: "Finish Date: " });
      r.appendText(fmtDate(b.finish_date));
    }

    if (cfg.show_tags) {
      const tagLine = renderTagsText(b.tags);
      if (tagLine) {
        const r = container.createEl("div", { attr: { style: "margin-top: 8px;" } });
        r.createEl("strong", { text: "Tags: " });
        r.appendText(tagLine);
      }
    }
  }
}
})();
```

