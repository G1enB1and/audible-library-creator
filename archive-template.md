---
type: archive
view: cards            # cards | table | (grid later)
columns: 5             # only used with table or grid
cover_size: 120        # cover image width

# Display Settings
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

  // Plain string (for search/filter matching only)
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
    const h = String(renderPlain(haystack)).toLowerCase();
    return h.includes(String(needle).toLowerCase());
  };

  // ISO 8601 duration like PT12H46M -> 12 hrs 46 mins
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

  // Rating rules: ">=0", ">3", "<=4.5", "=5", "5"
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

  // Rating stars from plugin settings
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

  // --- Phase 1 link reconstruction helpers ---
  function splitPeople(v) {
    const arr = Array.isArray(v) ? v : String(v ?? "").split(",");
    return arr.map(s => String(s).trim()).filter(Boolean);
  }

  function toAudibleSearchLink(kind, name) {
    const q = encodeURIComponent(name).replace(/%20/g, "+");
    if (kind === "Narrator") return `[${name}](https://www.audible.com/search?searchNarrator=${q})`;
    if (kind === "Author") return `[${name}](https://www.audible.com/search?searchAuthor=${q})`;
    if (kind === "Provider") return `[${name}](https://www.audible.com/search?searchProvider=${q})`;
    return `[${name}](https://www.audible.com/search?keywords=${q})`;
  }

  function renderAuthors(val) {
    const names = splitPeople(val);
    // join with line breaks like your book callouts
    return names.length ? names.map(n => `[[${n}]]`).join(",  \n") : "—";
  }

  function renderNarrators(val) {
    const names = splitPeople(val);
    return names.length ? names.map(n => toAudibleSearchLink("Narrator", n)).join(",  \n") : "—";
  }

  function renderPublisher(val) {
    // If it's already markdown, keep it. If plain, make provider search link.
    const s = String(val ?? "").trim();
    if (!s) return "—";
    if (s.includes("](") || s.includes("[[")) return s;
    return toAudibleSearchLink("Provider", s);
  }

  function renderTags(val) {
    const tags = asArray(val).map(t => String(t).trim()).filter(Boolean);
    if (!tags.length) return "";
    const style = String(cfg.tags_style || "hashtags").toLowerCase();

    if (style === "list") {
      return tags.join(", ");
    }
    // hashtags
    return tags.map(t => {
      const cleaned = t.startsWith("#") ? t.slice(1) : t;
      return `#${cleaned.replace(/\s+/g, "")}`;
    }).join(" ");
  }

  const md = (s) => dv.paragraph(s);

  const asCallout = (lines, calloutType = "book", title = "—") => {
    const out = [];
    out.push(`> [!${calloutType}] ${title}`);
    for (const line of lines) out.push(line === "" ? `>` : `> ${line}`);
    return out.join("\n");
  };

  // ---------- library pairing ----------
  const currentPath = normalizePath(cfg.file.path);
  const library = libs.find(l => normalizePath(l.archivePath) === currentPath);

  if (!library) {
    md(`> [!CAUTION] Library Configuration Required
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
    md(`> [!CAUTION] Books Path Missing
> Library **${library.name ?? "(Unnamed Library)"}** does not have a **Books Root** path set.
>
> **To fix this:**
> 1. Go to **Settings** → **Audible Library Creator**.
> 2. Find library **${library.name ?? "(Unnamed Library)"}**.
> 3. Set **Books Root** to the folder containing your book notes.
> 4. Reload this archive.`);
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

  if (q) {
    books = books.where(b => searchFields.some(f => String(renderPlain(b[f])).toLowerCase().includes(q)));
  }

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
  const limit = Number(cfg.limit ?? 200);
  if (!Number.isNaN(limit) && limit > 0) books = books.limit(limit);

  // ---------- render cards ----------
  const coverWidth = Number(cfg.cover_size ?? 300) || 300;

  md(`✅ **${library.name ?? "Library"}** • Folder: \`${booksFolderRaw}\` • Showing: **${books.length}**`);

  for (const b of books) {
    const lines = [];

    // Cover
    if (cfg.show_cover_image && b.cover_url) {
      lines.push(`<img src="${b.cover_url}" width="${coverWidth}" style="border-radius: 6px;">`);
      lines.push("");
    }

    // Title (Obsidian note link)
    if (cfg.show_title) {
      lines.push(`**Title:** ${b.file.link}`);
      lines.push("");
    }

    // Audible URL (optional)
    if (cfg.show_audible_url && b.url) {
      lines.push(`**Audible:** [Link](${b.url})`);
      lines.push("");
    }

    // People
    if (cfg.show_author)   lines.push(`**Author:** ${renderAuthors(b.author)}`);
    if (cfg.show_narrator) lines.push(`**Narrator:** ${renderNarrators(b.narrator)}`);
    lines.push("");

    // Series / Book / Length / Release
    if (cfg.show_series && b.series) lines.push(`**Series:** ${String(b.series)}`);
    if (cfg.show_book)              lines.push(`**Book:** ${renderPlain(b.book) || "—"}`);
    if (cfg.show_length)            lines.push(`**Length:** ${formatLength(b.length) || "—"}`);
    if (cfg.show_release_date)      lines.push(`**Release Date:** ${fmtDate(b.release_date) || "—"}`);
    lines.push("");

    // Publisher / Category
    if (cfg.show_publisher) lines.push(`**Publisher:** ${renderPublisher(b.publisher)}`);
    if (cfg.show_category)  lines.push(`**Category:** ${renderPlain(b.category) || "—"}`);
    lines.push("");

    // Status / Rating / Acquired / Source
    if (cfg.show_status)   lines.push(`**Status:** ${renderPlain(b.status) || "—"}`);
    if (cfg.show_rating)   lines.push(`**Rating:** ${b.rating != null ? ratingStars(b.rating) : "—"}`);
    if (cfg.show_acquired) lines.push(`**Acquired:** ${renderPlain(b.acquired) || "—"}`);
    if (cfg.show_source)   lines.push(`**Source:** ${renderPlain(b.source) || "—"}`);
    lines.push("");

    // Dates
    if (cfg.show_start_date)  lines.push(`**Start Date:** ${fmtDate(b.start_date)}`);
    if (cfg.show_finish_date) lines.push(`**Finish Date:** ${fmtDate(b.finish_date)}`);
    lines.push("");

    // Tags (optional)
    if (cfg.show_tags) {
      const tagLine = renderTags(b.tags);
      if (tagLine) {
        lines.push(`**Tags:** ${tagLine}`);
        lines.push("");
      }
    }

    const calloutTitle = `\`${renderPlain(b.title) || "—"}\``;
    md(asCallout(lines, "book", calloutTitle));
    md("---");
  }
})();
```

