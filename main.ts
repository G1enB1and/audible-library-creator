import {
  App,
  Modal,
  Notice,
  Plugin,
  Setting,
  TFile,
  TFolder,
  requestUrl
} from "obsidian";
import {
  AudibleLibraryCreatorSettings,
  DEFAULT_SETTINGS,
  AudibleLibraryCreatorSettingTab,
  safeNormalizePath,
  LibrarySettings
} from "./settings";



type PersonLink = { name: string; url: string };
type SeriesInfo = { name: string; url: string; book: string };

type BookData = {
  title: string;      // normalized title used everywhere (and as filename)
  url: string;
  coverUrl: string;
  authors: PersonLink[];
  narrators: PersonLink[];
  length: string;
  publisher: PersonLink;
  releaseDate: string;
  startDate: string;
  finishDate: string;
  series?: SeriesInfo;
  description: string;
  category: string;
  status: string;     // default blank
  acquired: string;
  source: string;
  rating: string;     // numeric value
  tags: string[];     // tokens without '#'
  type: string;
};

type AuthorData = {
  author: string;     // name
  url: string;        // audible url
  imageUrl: string;
  category: string;
  rating: string;     // numeric
  description: string;
  type: string;
};

interface SeriesPageData {
  series: string;
  url: string;
  books: string;
  description: string;
  category: string;
  rating: string;
  tags: string[];
  type: string;
}


// -------------------- utils --------------------
function cleanUrl(u: string): string {
  const s = (u ?? "").trim();
  if (!s) return "";
  try {
    const url = new URL(s, "https://www.audible.com");
    if (!url.pathname.includes("/search")) {
      url.search = "";
    }
    url.hash = "";
    return url.toString();
  } catch {
    // relative or malformed: just strip query/hash UNLESS it's a search
    if (s.includes("/search")) return s.split("#")[0];
    return s.split("?")[0].split("#")[0];
  }
}

function normalizeSpace(s: string): string {
  return (s ?? "")
    .replace(/\u00A0|\u202F|\u2009/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitle(title: string): string {
  let t = normalizeSpace(title);

  // match your Python normalize_title rules
  t = t.split(":").join(" - ");
  t = t.split("&").join(" and ");

  // remove Windows-illegal filename chars + control chars
  t = t.replace(/[<>:"/\\|?*\x00-\x1F]/g, "");

  t = normalizeSpace(t);
  t = t.replace(/[. ]+$/g, "").trim();

  if (t.length > 180) t = t.slice(0, 180).trim();
  return t;
}

function dedupeKeepOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of items) {
    const v = (x ?? "").trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function tagify(value: string): string[] {
  const s0 = normalizeSpace(value).replace(/&amp;/g, "&");
  if (!s0) return [];

  // unify separators to commas
  let s = s0
    .replace(/\s*(,|\||\/|•|·)\s*/g, ",")
    .replace(/\s*&\s*/g, " & ");

  const parts = s.split(",").map(p => p.trim()).filter(Boolean);

  const out: string[] = [];
  for (const p of parts) {
    const subs = p.includes(" & ")
      ? p.split(" & ").map(x => x.trim()).filter(Boolean)
      : [p];

    for (const x0 of subs) {
      const x = x0.replace(/[^\w\s-]/g, "").trim();
      if (!x) continue;

      const token = x
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join("");

      if (token) out.push(token);
    }
  }

  return dedupeKeepOrder(out);
}

function absAudibleUrl(href: string): string {
  const h = (href ?? "").trim();
  if (!h) return "";
  const full = h.startsWith("/") ? `https://www.audible.com${h}` : h;
  return cleanUrl(full);
}

function parseHtmlToDoc(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html");
}

// -------------------- JSON-LD --------------------
function extractJsonLdObjects(doc: Document): any[] {
  const out: any[] = [];
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  for (const s of scripts) {
    const raw = (s.textContent ?? "").trim();
    if (!raw) continue;
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const x of data) if (x && typeof x === "object") out.push(x);
      } else if (data && typeof data === "object") {
        out.push(data);
      }
    } catch {
      // ignore
    }
  }
  return out;
}

function pickBookishJsonLd(jsonlds: any[]): any | null {
  for (const obj of jsonlds) {
    const t = obj?.["@type"];
    const types = Array.isArray(t)
      ? t.map((x: any) => String(x).toLowerCase())
      : [String(t ?? "").toLowerCase()];
    if (types.some(x => ["book", "audiobook", "product", "creativework"].includes(x))) return obj;
  }
  return jsonlds.length ? jsonlds[0] : null;
}

function queryAllIncludingTemplates(docOrEl: ParentNode, selector: string): Element[] {
  const result: Element[] = Array.from(docOrEl.querySelectorAll(selector));
  const templates = docOrEl.querySelectorAll("template");
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i] as HTMLTemplateElement;
    if (t.content) {
      result.push(...queryAllIncludingTemplates(t.content, selector));
    }
  }
  return result;
}

// -------------------- scrape pieces (DOM-based) --------------------
function scrapeAdblMetadata(doc: Document): any | null {
  const metaEl = doc.querySelector('adbl-product-metadata script[type="application/json"]');
  if (!metaEl) return null;
  try {
    return JSON.parse(metaEl.textContent ?? "{}");
  } catch {
    return null;
  }
}

function scrapeTitleAndUrl(doc: Document, inputUrl: string, jsonld: any | null): { title: string; url: string } {
  const jdTitle = typeof jsonld?.name === "string" ? normalizeSpace(jsonld.name) : "";
  const jdUrl = typeof jsonld?.url === "string" ? cleanUrl(jsonld.url) : "";

  if (jdTitle) return { title: jdTitle, url: jdUrl || cleanUrl(inputUrl) };

  const ogTitle =
    (doc.querySelector('meta[property="og:title"]') as HTMLMetaElement | null)?.content ??
    (doc.querySelector('meta[name="og:title"]') as HTMLMetaElement | null)?.content ??
    "";

  if (ogTitle) return { title: normalizeSpace(ogTitle), url: cleanUrl(inputUrl) };

  return { title: "Unknown Title", url: cleanUrl(inputUrl) };
}

function scrapeCover(doc: Document, jsonld: any | null): string {
  const img = jsonld?.image;
  if (typeof img === "string" && img.startsWith("http")) return cleanUrl(img);
  if (Array.isArray(img) && typeof img[0] === "string") return cleanUrl(img[0]);

  const ogImg =
    (doc.querySelector('meta[property="og:image"]') as HTMLMetaElement | null)?.content ??
    (doc.querySelector('meta[name="og:image"]') as HTMLMetaElement | null)?.content ??
    "";

  return ogImg ? cleanUrl(ogImg) : "";
}

function scrapeDescription(doc: Document, jsonld: any | null): string {
  const jd = typeof jsonld?.description === "string" ? normalizeSpace(jsonld.description) : "";
  if (jd) return jd;

  const og =
    (doc.querySelector('meta[property="og:description"]') as HTMLMetaElement | null)?.content ??
    (doc.querySelector('meta[name="og:description"]') as HTMLMetaElement | null)?.content ??
    "";

  return og ? normalizeSpace(og) : "";
}

function dedupePersonsByName(items: PersonLink[]): PersonLink[] {
  const seen = new Set<string>();
  const out: PersonLink[] = [];
  for (const a of items) {
    const name = normalizeSpace(a.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, url: cleanUrl(a.url ?? "") });
  }
  return out;
}

function scrapeAuthors(doc: Document, jsonld: any | null): PersonLink[] {
  const authors: PersonLink[] = [];

  const add = (name: string, url?: string) => {
    const n = normalizeSpace(name);
    if (!n) return;
    authors.push({ name: n, url: cleanUrl(url ?? "") });
  };

  // 1) JSON-LD first
  const jdAuth = jsonld?.author;
  if (Array.isArray(jdAuth)) {
    for (const a of jdAuth) {
      if (typeof a === "string") add(a);
      else if (a && typeof a === "object") add(a.name ?? "", a.url ?? "");
    }
  } else if (jdAuth && typeof jdAuth === "object") {
    add(jdAuth.name ?? "", jdAuth.url ?? "");
  } else if (typeof jdAuth === "string") {
    add(jdAuth);
  }

  let result = dedupePersonsByName(authors);
  const needFill = result.length === 0 || result.some(a => !a.url);

  if (!needFill) return result;

  // 2) Fill missing URLs by scanning only likely byline containers (avoid recos)
  const containers: Element[] = [];

  // data-testid / class heuristics (similar spirit to python selectors)
  const selList = [
    '[data-testid*="byline"]',
    '[class*="byLine"]',
    '[class*="byline"]'
  ];
  for (const sel of selList) {
    containers.push(...queryAllIncludingTemplates(doc, sel));
  }

  // also capture nearby parents of text nodes containing "By" / "Written by"
  // We’ll scan elements whose text contains these keywords and that have /author/ links.
  const allEls = queryAllIncludingTemplates(doc, "div,span,section");
  for (const el of allEls) {
    const txt = (el.textContent ?? "");
    if (!/(\bBy\b|\bWritten by\b|\bAuthor\b)/i.test(txt)) continue;
    if (el.querySelector('a[href*="/author/"]')) containers.push(el);
  }

  // build candidate map: name -> url
  const candidates = new Map<string, string>();
  for (const c of containers) {
    const links = Array.from(c.querySelectorAll('a[href*="/author/"]')) as HTMLAnchorElement[];
    for (const a of links) {
      const name = normalizeSpace(a.textContent ?? "");
      if (!name) continue;
      candidates.set(name.toLowerCase(), absAudibleUrl(a.getAttribute("href") ?? ""));
    }
  }

  // fill known names
  if (result.length) {
    result = result.map(a => {
      if (a.url) return a;
      const url = candidates.get(a.name.toLowerCase()) ?? "";
      return { name: a.name, url: absAudibleUrl(url) };
    });
    return dedupePersonsByName(result);
  }

  // if JSON-LD had no authors (rare), fall back to candidates
  const filled: PersonLink[] = [];
  for (const [k, v] of candidates.entries()) {
    const pretty = k.replace(/\b\w/g, c => c.toUpperCase());
    filled.push({ name: pretty, url: cleanUrl(v) });
  }
  return dedupePersonsByName(filled);
}

function scrapeNarrators(doc: Document, jsonld: any | null): PersonLink[] {
  const narrators: PersonLink[] = [];
  const add = (name: string, url?: string) => {
    const n = normalizeSpace(name);
    if (!n) return;
    narrators.push({ name: n, url: absAudibleUrl(url ?? "") });
  };

  // 1) JSON-LD first
  const jdNar = jsonld?.readBy ?? jsonld?.narrator;
  if (Array.isArray(jdNar)) {
    for (const n of jdNar) {
      if (typeof n === "string") add(n);
      else if (n && typeof n === "object") add(n.name ?? "", n.url ?? "");
    }
  } else if (jdNar && typeof jdNar === "object") {
    add(jdNar.name ?? "", jdNar.url ?? "");
  } else if (typeof jdNar === "string") {
    add(jdNar);
  }

  let result = dedupePersonsByName(narrators);
  const needUrls = result.length === 0 || result.some(n => !n.url);
  if (!needUrls) return result;

  // 2) Scan containers to fill URLs or find missing names
  const containers: Element[] = [];
  const selList = [
    '[data-testid*="byline"]',
    '[class*="byLine"]',
    '[class*="byline"]',
    '[data-testid*="narrator"]',
    '[data-testid="line"]'
  ];
  for (const sel of selList) {
    containers.push(...queryAllIncludingTemplates(doc, sel));
  }

  const allEls = queryAllIncludingTemplates(doc, "div,span,section,li");
  for (const el of allEls) {
    const txt = (el.textContent ?? "");
    if (/\bNarrated by\b/i.test(txt)) {
      if (el.querySelector('a[href*="/narrator/"], a[href*="Narrator"], a[href*="narrator"]')) containers.push(el);
    }
  }

  // build candidate map: name -> url
  const candidates = new Map<string, string>();
  for (const c of containers) {
    const links = Array.from(c.querySelectorAll('a[href]')) as HTMLAnchorElement[];
    for (const a of links) {
      const href = a.getAttribute("href") ?? "";
      if (!href.toLowerCase().includes("narrator") && !href.toLowerCase().includes("search")) continue;
      const name = normalizeSpace(a.textContent ?? "");
      if (!name) continue;
      candidates.set(name.toLowerCase(), absAudibleUrl(href));
    }
  }

  // fill known names
  if (result.length) {
    result = result.map(n => {
      if (n.url) return n;
      const url = candidates.get(n.name.toLowerCase()) ?? "";
      return { name: n.name, url: absAudibleUrl(url) };
    });
    return dedupePersonsByName(result);
  }

  // fallback to candidates
  const filled: PersonLink[] = [];
  for (const [k, v] of candidates.entries()) {
    const pretty = k.replace(/\b\w/g, c => c.toUpperCase());
    filled.push({ name: pretty, url: absAudibleUrl(v) });
  }
  return dedupePersonsByName(filled);
}

function scrapeLength(doc: Document, adblMeta: any | null, jsonld: any | null): string {
  if (adblMeta?.duration) return normalizeSpace(adblMeta.duration);
  if (jsonld?.duration) {
    const d = String(jsonld.duration);
    if (d.startsWith("PT")) {
      const h = d.match(/(\d+)H/)?.[1];
      const m = d.match(/(\d+)M/)?.[1];
      let out = "";
      if (h) out += `${h} hrs `;
      if (m) out += `${m} mins`;
      return normalizeSpace(out) || d;
    }
    return normalizeSpace(d);
  }

  const lines = queryAllIncludingTemplates(doc, '[data-testid="line"]');
  const line = lines.find(l => {
    const text = l.querySelector(".label")?.textContent?.toLowerCase() ?? "";
    const eventId = l.getAttribute("data-event-id")?.toLowerCase() ?? "";
    const key = l.getAttribute("key")?.toLowerCase() ?? "";
    return text.includes("length") || text.includes("runtime") || eventId === "duration" || eventId === "runtime" || key === "duration" || key === "runtime";
  });
  if (!line) return "";

  const valText = line.querySelector(".values .text")?.textContent;
  if (valText) return normalizeSpace(valText);

  const parts = line.textContent?.split(":") ?? [];
  return normalizeSpace(parts[1] ?? "");
}

function scrapePublisher(doc: Document, adblMeta: any | null, jsonld: any | null): PersonLink {
  const makeLink = (name: string, url?: string): PersonLink => {
    return { name: normalizeSpace(name), url: absAudibleUrl(url ?? "") };
  };

  // 1. Determine the best name and potential URL from sources
  let pName = "";
  let pUrl = "";

  // Priority 1: adblMeta
  if (adblMeta?.publisher) {
    if (typeof adblMeta.publisher === "string") {
      pName = adblMeta.publisher;
    } else {
      pName = adblMeta.publisher.name ?? "";
      pUrl = adblMeta.publisher.url ?? "";
    }
  }

  // Priority 2: JSON-LD (if no name yet)
  if (!pName) {
    if (jsonld?.publisher?.name) {
      pName = jsonld.publisher.name;
      pUrl = jsonld.publisher.url ?? "";
    } else if (typeof jsonld?.publisher === "string") {
      pName = jsonld.publisher;
    }
  }

  // Priority 3: DOM (if no name yet)
  if (!pName) {
    const lines = queryAllIncludingTemplates(doc, '[data-testid="line"]');
    const line = lines.find(l => {
      const text = l.querySelector(".label")?.textContent?.toLowerCase() ?? "";
      const eventId = l.getAttribute("data-event-id")?.toLowerCase() ?? "";
      const key = l.getAttribute("key")?.toLowerCase() ?? "";
      return text.includes("publisher") || eventId === "publisher" || key === "publisher";
    });

    if (line) {
      const a = line.querySelector("a");
      if (a) {
        pName = a.textContent ?? "";
        pUrl = a.getAttribute("href") ?? "";
      } else {
        const valText = line.querySelector(".values .text")?.textContent;
        if (valText) {
          pName = valText;
        } else {
          const parts = line.textContent?.split(":") ?? [];
          if (parts[1]) pName = parts[1];
        }
      }
    }
  }

  pName = normalizeSpace(pName);
  pUrl = absAudibleUrl(pUrl);

  // If we have no name, give up
  if (!pName) return makeLink("Unknown Publisher");

  // If we have a URL, we're good
  if (pUrl) return makeLink(pName, pUrl);

  // 2. We have a Name but no URL. Let's find one.
  // Scan all links in the doc for this publisher name or searchProvider
  const links = queryAllIncludingTemplates(doc, "a[href]") as HTMLAnchorElement[];
  for (const link of links) {
    const href = link.getAttribute("href") ?? "";
    const lText = normalizeSpace(link.textContent ?? "");

    // Exact name match?
    if (lText.toLowerCase() === pName.toLowerCase()) {
      return makeLink(pName, href);
    }

    // Fallback: heuristic match on keywords
    if (href.toLowerCase().includes("search") && (href.toLowerCase().includes("provider") || href.toLowerCase().includes("publisher"))) {
      if (lText.toLowerCase().includes(pName.toLowerCase()) || pName.toLowerCase().includes(lText.toLowerCase())) {
        return makeLink(pName, href);
      }
    }
  }

  // 3. Last Resort: Construct a search URL
  // "https://www.audible.com/search?searchProvider=NAME"
  const searchUrl = `https://www.audible.com/search?searchProvider=${encodeURIComponent(pName)}`;
  return makeLink(pName, searchUrl);
}

function scrapeReleaseDate(doc: Document, adblMeta: any | null, jsonld: any | null): string {
  if (adblMeta?.releaseDate) return normalizeSpace(adblMeta.releaseDate);
  if (jsonld?.datePublished) return normalizeSpace(jsonld.datePublished);

  const lines = queryAllIncludingTemplates(doc, '[data-testid="line"]');
  const line = lines.find(l => {
    const text = l.querySelector(".label")?.textContent?.toLowerCase() ?? "";
    const eventId = l.getAttribute("data-event-id")?.toLowerCase() ?? "";
    const key = l.getAttribute("key")?.toLowerCase() ?? "";
    return text.includes("release date") || eventId === "releasedate" || key === "releasedate";
  });
  if (!line) return "";

  const valText = line.querySelector(".values .text")?.textContent;
  if (valText) return normalizeSpace(valText);

  const parts = line.textContent?.split(":") ?? [];
  return normalizeSpace(parts[1] ?? "");
}

function scrapeSeries(doc: Document): SeriesInfo | undefined {
  const findBookNum = (text: string): string => {
    const t = normalizeSpace(text);
    const m = t.match(/\bBook\s+(\d+)\b/i);
    return m ? m[1] : "";
  };

  // Prefer the details line
  let seriesLine =
    doc.querySelector('div[data-testid="line"][data-event-id="series"]') ||
    doc.querySelector('div[data-testid="line"][key="series"]');

  // fallback: any line where label is "Series"
  if (!seriesLine) {
    const lines = Array.from(doc.querySelectorAll('div[data-testid="line"]'));
    for (const line of lines) {
      const label = line.querySelector(".label");
      const labelText = normalizeSpace(label?.textContent ?? "");
      if (labelText.toLowerCase() === "series") {
        seriesLine = line;
        break;
      }
    }
  }

  let seriesName = "";
  let seriesUrl = "";
  let bookNum = "";

  if (seriesLine) {
    const a = seriesLine.querySelector('a.link[href*="/series/"]') as HTMLAnchorElement | null;
    if (a) {
      seriesName = normalizeSpace(a.textContent ?? "");
      seriesUrl = absAudibleUrl(a.getAttribute("href") ?? "");
    }
    bookNum = findBookNum(seriesLine.textContent ?? "");
  }

  // fallback: first /series/ link on the page and look nearby for Book N
  if (!seriesUrl) {
    const a = doc.querySelector('a[href*="/series/"]') as HTMLAnchorElement | null;
    if (a) {
      seriesName = normalizeSpace(a.textContent ?? "");
      seriesUrl = absAudibleUrl(a.getAttribute("href") ?? "");
      let cur: Element | null = a.parentElement;
      for (let i = 0; i < 4 && cur && !bookNum; i++) {
        bookNum = findBookNum(cur.textContent ?? "");
        cur = cur.parentElement;
      }
    }
  }

  if (!seriesName || !seriesUrl) return undefined;
  return { name: seriesName, url: cleanUrl(seriesUrl), book: bookNum ?? "" };
}

function scrapeTags(doc: Document, jsonld: any | null): string[] {
  let tags: string[] = [];

  // 1) Audible chips (restricted to the correct chip group)
  const chips = Array.from(
    doc.querySelectorAll("adbl-chip-group.product-topictag-impression adbl-chip, adbl-chip-group.related-tag-impression adbl-chip")
  );
  for (const chip of chips) {
    const t = normalizeSpace(chip.textContent ?? "");
    if (t) tags.push(...tagify(t));
  }

  // 2) Categories row
  const catRow = doc.querySelector('div[data-testid="line"][key="categories"]');
  if (catRow) {
    const links = Array.from(catRow.querySelectorAll("a.link[href]")) as HTMLAnchorElement[];
    for (const a of links) {
      const t = normalizeSpace(a.textContent ?? "");
      if (t) tags.push(...tagify(t));
    }
  }

  // 3) JSON-LD genre (optional)
  const genre = jsonld?.genre;
  if (typeof genre === "string") tags.push(...tagify(genre));
  else if (Array.isArray(genre)) {
    for (const g of genre) if (typeof g === "string") tags.push(...tagify(g));
  }

  // remove junk
  const bad = new Set(["audible", "audiobooks", "audiobook"]);
  tags = tags.filter(t => t && !bad.has(t.toLowerCase()));

  return dedupeKeepOrder(tags);
}

// -------------------- template/render --------------------
async function readTemplate(app: App, inputPath: string): Promise<string> {
  const raw = (inputPath ?? "").trim();
  if (!raw) throw new Error("Template path is empty.");

  const norm = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  const file = app.vault.getAbstractFileByPath(norm);

  if (!file || !(file instanceof TFile)) {
    throw new Error(`Template not found: ${norm}`);
  }
  return await app.vault.read(file);
}

function renderFromTemplate(tpl: string, data: BookData | AuthorData | SeriesPageData): string {
  let out = tpl;
  // avoid replaceAll for lib target friendliness
  const rep = (k: string, v: string) => { out = out.split(k).join(v); };

  if ("title" in data) {
    // Book Data
    const d = data as any; // Cast as any to access local overrides
    const authorsPlain = d.authors.map((a: any) => a.name).filter(Boolean).join(", ");
    const authorsMd = d.authors_md_override ?? (d.authors.length
      ? d.authors.map((a: any) => a.url ? `[${a.name}](${cleanUrl(a.url)})` : a.name).join(",  \n")
      : "_Unknown_");

    const narratorsPlain = (d.narrators ?? []).map((a: any) => a.name).filter(Boolean).join(", ");
    const narratorsMd = (d.narrators ?? []).length
      ? (d.narrators ?? []).map((a: any) => a.url ? `[${a.name}](${cleanUrl(a.url)})` : a.name).join(",  \n")
      : "_Unknown_";

    const seriesPlain = d.series?.name ?? "";
    const seriesMd = d.series
      ? (d.series.url ? `[${d.series.name}](${cleanUrl(d.series.url)})` : d.series.name)
      : "";
    const bookMd = d.series?.book ?? "";

    const publisherPlain = d.publisher?.name ?? "";
    const publisherMd = d.publisher
      ? (d.publisher.url ? `[${d.publisher.name}](${cleanUrl(d.publisher.url)})` : d.publisher.name)
      : "";

    const tagsMd = d.tags.map((t: any) => `#${t}`).join(" ");
    const tagsYaml = "[" + d.tags.map((t: any) => JSON.stringify(t)).join(",") + "]";

    rep("{{title}}", d.title ?? "");
    rep("{{cover_url}}", cleanUrl(d.coverUrl ?? ""));
    rep("{{authors_md}}", authorsMd);
    rep("{{authors_plain}}", authorsPlain);
    rep("{{narrators_md}}", narratorsMd);
    rep("{{narrators_plain}}", narratorsPlain);
    rep("{{length}}", d.length ?? "");
    rep("{{publisher}}", publisherMd);
    rep("{{publisher_plain}}", publisherPlain);
    rep("{{release_date}}", d.releaseDate ?? "");
    rep("{{start_date}}", d.startDate ?? "");
    rep("{{finish_date}}", d.finishDate ?? "");
    rep("{{series_md}}", seriesMd);
    rep("{{series_plain}}", seriesPlain);
    rep("{{book_md}}", bookMd);
    rep("{{tags}}", tagsMd);
    rep("{{tags_yaml}}", tagsYaml);
    rep("{{status}}", d.status ?? "");
    rep("{{acquired}}", d.acquired ?? "");
    rep("{{source}}", d.source ?? "");
  } else if ("series" in data && !("title" in data)) {
    // Series Data
    const d = data as SeriesPageData;
    const tagsMd = d.tags.map((t: any) => `#${t}`).join(" ");
    const tagsYaml = "[" + d.tags.map((t: any) => JSON.stringify(t)).join(",") + "]";

    rep("{{series}}", d.series ?? "");
    rep("{{Series}}", d.series ?? ""); // Handle both case variations
    rep("{{books}}", d.books ?? "");
    rep("{{category}}", d.category ?? "");
    rep("{{tags}}", tagsMd);
    rep("{{tags_yaml}}", tagsYaml);
  } else {
    // Author Data
    const d = data as AuthorData;
    rep("{{author_plain}}", d.author);
    rep("{{author_md}}", `[[${d.author}]]`);
    rep("{{image_url}}", cleanUrl(d.imageUrl ?? ""));
  }

  rep("{{type}}", data.type ?? "");
  rep("{{category}}", data.category ?? "");
  rep("{{url}}", cleanUrl(data.url ?? ""));
  rep("{{description}}", (data.description ?? "").trim());
  rep("{{rating}}", data.rating ?? "");

  out = out.replace(/\n{4,}/g, "\n\n\n");
  return out.trim() + "\n";
}

// -------------------- scrape book (main) --------------------
async function scrapeAudible(
  url: string,
  library: LibrarySettings,
  settings: AudibleLibraryCreatorSettings,
  statusOverride?: string,
  ratingOverride?: string
): Promise<BookData> {
  const resp = await requestUrl({ url, headers: { "Accept-Language": "en-US,en;q=0.9" } });
  const html = resp.text;

  const doc = parseHtmlToDoc(html);
  const jsonlds = extractJsonLdObjects(doc);
  const jsonld = pickBookishJsonLd(jsonlds);

  const { title: rawTitle, url: canonicalUrl } = scrapeTitleAndUrl(doc, url, jsonld);
  const title = normalizeTitle(rawTitle);

  const coverUrl = scrapeCover(doc, jsonld);
  const description = scrapeDescription(doc, jsonld);

  const authors = scrapeAuthors(doc, jsonld);
  const adblMeta = scrapeAdblMetadata(doc);
  const narrators = scrapeNarrators(doc, jsonld);
  const series = scrapeSeries(doc);
  const length = scrapeLength(doc, adblMeta, jsonld);
  const publisher = scrapePublisher(doc, adblMeta, jsonld);
  const releaseDate = scrapeReleaseDate(doc, adblMeta, jsonld);

  // tags
  let tags: string[] = [];
  const tagRules = JSON.parse(settings.tagRulesJson);
  tags.push(...(tagRules.baseTags || []));
  tags.push(...scrapeTags(doc, jsonld));

  // Per-library tags can still use the library name as a key in tagRules
  const categoryTags = tagRules.categoryTags?.[library.name];
  if (categoryTags && Array.isArray(categoryTags)) {
    tags.push(...categoryTags);
  }

  tags = dedupeKeepOrder(tags);

  return {
    title,
    url: cleanUrl(canonicalUrl),
    coverUrl,
    authors,
    narrators,
    series,
    length,
    publisher,
    releaseDate,
    startDate: "",
    finishDate: "",
    description,
    category: library.name,
    status: statusOverride ?? settings.defaultStatus,
    acquired: settings.defaultAcquired,
    source: settings.defaultSource,
    rating: ratingOverride ?? String(settings.defaultRatingNumber),
    tags,
    type: "book"
  };
}

async function scrapeAuthor(
  url: string,
  library: LibrarySettings,
  settings: AudibleLibraryCreatorSettings,
  ratingOverride?: string
): Promise<AuthorData> {
  const resp = await requestUrl({ url, headers: { "Accept-Language": "en-US,en;q=0.9" } });
  const html = resp.text;
  const doc = parseHtmlToDoc(html);
  const jsonlds = extractJsonLdObjects(doc);
  const jsonld = pickBookishJsonLd(jsonlds);

  // Author name from H1
  const authorName = doc.querySelector("h1")?.textContent?.trim() ?? "Unknown Author";

  // Image from profile picture or social meta
  let imageUrl = doc.querySelector("img.author-profile-picture")?.getAttribute("src") ?? "";
  if (!imageUrl) {
    imageUrl = doc.querySelector("meta[property='og:image']")?.getAttribute("content") ?? "";
  }

  return {
    author: authorName,
    url: cleanUrl(url),
    imageUrl: cleanUrl(imageUrl),
    category: "Author",
    rating: ratingOverride ?? "0",
    description: scrapeDescription(doc, jsonld),
    type: "Author"
  };
}

async function scrapeSeriesPage(
  url: string,
  settings: AudibleLibraryCreatorSettings,
  libraryName: string,
  ratingOverride?: string
): Promise<SeriesPageData> {
  const resp = await requestUrl({ url, headers: { "Accept-Language": "en-US,en;q=0.9" } });
  const html = resp.text;
  const doc = parseHtmlToDoc(html);
  const jsonlds = extractJsonLdObjects(doc);
  const jsonld = pickBookishJsonLd(jsonlds);

  const seriesName = normalizeSpace(doc.querySelector("h1")?.textContent ?? "");

  // Description
  // Try specific DOM selectors first to avoid generic SEO text in JSON-LD
  let description = "";
  const descEls = [
    doc.querySelector(".series-summary-content"),
    doc.querySelector("#series-description .bc-section"),
    doc.querySelector('[data-widget="description"] .bc-text'),
    doc.querySelector('[data-testid="description"]'),
    doc.querySelector(".series-description"),
    doc.querySelector(".bc-expander-content")
  ];
  for (const el of descEls) {
    if (el) {
      description = normalizeSpace(el.textContent ?? "");
      if (description && !description.includes("Listen to") && !description.includes("Audiobooks on Audible")) {
        break;
      }
    }
  }

  if (!description) {
    description = scrapeDescription(doc, jsonld);
  }

  // Tags
  let tags = scrapeTags(doc, jsonld);
  if (tags.length === 0) {
    // try any bc-chips
    const chips = doc.querySelectorAll(".bc-chip");
    for (const chip of Array.from(chips)) {
      const t = normalizeSpace(chip.textContent ?? "");
      if (t) tags.push(...tagify(t));
    }
  }
  tags = dedupeKeepOrder(tags);
  const category = libraryName;

  // Books Count
  const numBooksEl = doc.querySelector(".num-books-in-series");
  let booksCount = "0";
  if (numBooksEl) {
    const m = numBooksEl.textContent?.match(/(\d+)/);
    if (m) booksCount = m[1];
  }

  if (booksCount === "0") {
    // Fallback to counting items in the main container only, if possible
    // Search for the main product list item container
    const mainResults = doc.querySelector('#series-results, [data-widget="product-list"]');
    const productItems = mainResults ? queryAllIncludingTemplates(mainResults, 'li.bc-list-item, [data-testid="product-list-item"]') : [];

    if (productItems.length > 0) {
      booksCount = productItems.length.toString();
    } else {
      // try to find title text like "5 titles"
      const textNodes = doc.querySelectorAll(".bc-text, .bc-heading");
      for (const node of Array.from(textNodes)) {
        const t = node.textContent ?? "";
        const m = t.match(/(\d+)\s+titles/);
        if (m) {
          booksCount = m[1];
          break;
        }
      }
    }
  }

  return {
    series: seriesName,
    url: cleanUrl(url),
    books: booksCount,
    description: description,
    category: category,
    rating: ratingOverride ?? "0",
    tags: tags,
    type: "Series"
  };
}




// -------------------- modal --------------------
class CreateBookModal extends Modal {
  plugin: AudibleLibraryCreatorPlugin;
  url = "";
  libraryId = "";
  status = "";
  rating = "";
  overwriteOverride = false;
  createAuthorPage = false;
  createSeriesPage = false;

  constructor(app: App, plugin: AudibleLibraryCreatorPlugin) {
    super(app);
    this.plugin = plugin;
    this.libraryId = plugin.settings.activeLibraryId;
    this.status = plugin.settings.defaultStatus;
    this.rating = String(plugin.settings.defaultRatingNumber);
    this.overwriteOverride = plugin.settings.overwriteIfExists;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Create Book from Audible" });

    new Setting(contentEl)
      .setName("Audible URL")
      .setDesc("Paste the Audible book page URL (https://www.audible.com/pd/...)")
      .addText(t => {
        t.setPlaceholder("https://www.audible.com/pd/...")
          .onChange(v => (this.url = v.trim()));
        t.inputEl.style.width = "100%";
      });

    new Setting(contentEl)
      .setName("Library")
      .setDesc("Select the target library for this book.")
      .addDropdown(d => {
        this.plugin.settings.libraries.forEach(lib => {
          d.addOption(lib.id, lib.name);
        });
        d.setValue(this.libraryId);
        d.onChange(v => (this.libraryId = v));
      });

    new Setting(contentEl)
      .setName("Status")
      .addText(t => {
        t.setValue(this.status)
          .onChange(v => (this.status = v.trim()));
        t.inputEl.style.width = "100%";
      });

    new Setting(contentEl)
      .setName("Rating")
      .setDesc("Numeric rating (e.g. 3 or 4.5)")
      .addText(t => {
        t.setValue(this.rating)
          .onChange(v => (this.rating = v.trim()));
        t.inputEl.style.width = "100%";
      });

    new Setting(contentEl)
      .setName("Overwrite Existing Book")
      .addToggle(tg => {
        tg.setValue(this.overwriteOverride)
          .onChange(v => (this.overwriteOverride = v));
      });

    const lib = this.plugin.settings.libraries.find(l => l.id === this.libraryId);
    const hasAuthorFolder = lib && safeNormalizePath(lib.authorsFolder);

    if (this.plugin.settings.authorTemplatePath && hasAuthorFolder) {
      new Setting(contentEl)
        .setName("Create Author's Page")
        .setDesc("Automatically create or update the author's reference page.")
        .addToggle(tg => {
          tg.setValue(this.createAuthorPage)
            .onChange(v => (this.createAuthorPage = v));
        });
    }

    const hasSeriesFolder = lib && safeNormalizePath(lib.seriesFolder);
    if (this.plugin.settings.seriesTemplatePath && hasSeriesFolder) {
      new Setting(contentEl)
        .setName("Create Series Page")
        .setDesc("Automatically create or update the series reference page.")
        .addToggle(tg => {
          tg.setValue(this.createSeriesPage)
            .onChange(v => (this.createSeriesPage = v));
        });
    }

    new Setting(contentEl)
      .addButton(btn => {
        btn.setButtonText("Create")
          .setCta()
          .onClick(async () => {
            try {
              if (!this.url) {
                new Notice("Please enter an Audible URL.");
                return;
              }
              const library = this.plugin.settings.libraries.find(l => l.id === this.libraryId);
              if (!library) {
                new Notice("Selected library not found.");
                return;
              }

              // Update active library for next time
              if (this.plugin.settings.activeLibraryId !== this.libraryId) {
                this.plugin.settings.activeLibraryId = this.libraryId;
                await this.plugin.saveSettings();
              }

              await this.plugin.createBookFromAudible(this.url, library, this.status, this.rating, this.overwriteOverride, this.createAuthorPage, this.createSeriesPage);
              this.close();
            } catch (e: any) {
              console.error(e);
              new Notice(`Failed: ${e?.message ?? String(e)}`);
            }
          });
      });

    new Setting(contentEl)
      .addButton(btn => {
        btn.setButtonText("Cancel").onClick(() => this.close());
      });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class CreateAuthorModal extends Modal {
  plugin: AudibleLibraryCreatorPlugin;
  url = "";
  libraryId = "";
  rating = "";
  overwriteOverride = false;

  constructor(app: App, plugin: AudibleLibraryCreatorPlugin) {
    super(app);
    this.plugin = plugin;
    this.libraryId = plugin.settings.activeLibraryId;
    this.rating = String(plugin.settings.defaultRatingNumber);
    this.overwriteOverride = plugin.settings.overwriteIfExists;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Create Author from Audible" });

    new Setting(contentEl)
      .setName("Audible URL")
      .setDesc("Paste the Audible author page URL")
      .addText(t => {
        t.setPlaceholder("https://www.audible.com/author/...")
          .onChange(v => (this.url = v.trim()));
        t.inputEl.style.width = "100%";
      });

    new Setting(contentEl)
      .setName("Library")
      .addDropdown(d => {
        this.plugin.settings.libraries.forEach(lib => {
          d.addOption(lib.id, lib.name);
        });
        d.setValue(this.libraryId);
        d.onChange(v => (this.libraryId = v));
      });

    new Setting(contentEl)
      .setName("Rating")
      .addText(t => {
        t.setValue(this.rating)
          .onChange(v => (this.rating = v.trim()));
        t.inputEl.style.width = "100%";
      });

    new Setting(contentEl)
      .setName("Overwrite Existing Author")
      .addToggle(tg => {
        tg.setValue(this.overwriteOverride)
          .onChange(v => (this.overwriteOverride = v));
      });

    new Setting(contentEl)
      .addButton(btn => {
        btn.setButtonText("Create")
          .setCta()
          .onClick(async () => {
            try {
              if (!this.url) {
                new Notice("Please enter an Audible URL.");
                return;
              }
              const library = this.plugin.settings.libraries.find(l => l.id === this.libraryId);
              if (!library) {
                new Notice("Selected library not found.");
                return;
              }
              await this.plugin.createAuthorFromAudible(this.url, library, this.rating, this.overwriteOverride);
              this.close();
            } catch (e: any) {
              console.error(e);
              new Notice(`Failed: ${e?.message ?? String(e)}`);
            }
          });
      });

    new Setting(contentEl)
      .addButton(btn => {
        btn.setButtonText("Cancel").onClick(() => this.close());
      });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class CreateSeriesModal extends Modal {
  plugin: AudibleLibraryCreatorPlugin;
  url = "";
  libraryId = "";
  rating = "";
  overwriteOverride = false;

  constructor(app: App, plugin: AudibleLibraryCreatorPlugin) {
    super(app);
    this.plugin = plugin;
    this.libraryId = plugin.settings.activeLibraryId;
    this.rating = String(plugin.settings.defaultRatingNumber);
    this.overwriteOverride = plugin.settings.overwriteIfExists;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Create Series Page from Audible" });

    new Setting(contentEl)
      .setName("Audible Series URL")
      .setDesc("Paste the Audible series page URL")
      .addText(t => {
        t.setPlaceholder("https://www.audible.com/series/...")
          .onChange(v => (this.url = v.trim()));
        t.inputEl.style.width = "100%";
      });

    new Setting(contentEl)
      .setName("Library")
      .setDesc("Select the target library for this series.")
      .addDropdown(d => {
        this.plugin.settings.libraries.forEach(lib => {
          d.addOption(lib.id, lib.name);
        });
        d.setValue(this.libraryId);
        d.onChange(v => (this.libraryId = v));
      });

    new Setting(contentEl)
      .setName("Rating")
      .setDesc("Numeric rating (e.g. 3 or 4.5)")
      .addText(t => {
        t.setValue(this.rating)
          .onChange(v => (this.rating = v.trim()));
        t.inputEl.style.width = "100%";
      });

    new Setting(contentEl)
      .setName("Overwrite Existing Series")
      .addToggle(tg => {
        tg.setValue(this.overwriteOverride)
          .onChange(v => (this.overwriteOverride = v));
      });

    new Setting(contentEl).addButton(btn =>
      btn
        .setButtonText("Create Series Page")
        .setCta()
        .onClick(async () => {
          if (!this.url) {
            new Notice("Please enter a URL.");
            return;
          }
          const lib = this.plugin.settings.libraries.find(l => l.id === this.libraryId);
          if (!lib) return;
          this.close();
          await this.plugin.createSeriesFromAudible(this.url, lib, this.rating, this.overwriteOverride);
        })
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}

// -------------------- plugin --------------------
export default class AudibleLibraryCreatorPlugin extends Plugin {
  settings!: AudibleLibraryCreatorSettings;
  ribbonIcons: HTMLElement[] = [];

  async onload() {
    console.log(`Audible Library Creator v${this.manifest.version} loading...`);
    await this.loadSettings();

    this.refreshRibbonIcons();

    this.addCommand({
      id: "add-audible-book",
      name: "Add Audible Book",
      callback: () => new CreateBookModal(this.app, this).open()
    });

    this.addCommand({
      id: "add-audible-author",
      name: "Add Audible Author",
      callback: () => new CreateAuthorModal(this.app, this).open()
    });

    this.addCommand({
      id: "add-audible-series",
      name: "Add Audible Series",
      callback: () => new CreateSeriesModal(this.app, this).open()
    });

    this.addSettingTab(new AudibleLibraryCreatorSettingTab(this.app, this));
  }

  refreshRibbonIcons() {
    // Clear existing
    this.ribbonIcons.forEach(icon => icon.remove());
    this.ribbonIcons = [];

    if (this.settings.showBookRibbonIcon) {
      const icon = this.addRibbonIcon("book-open", "Add Audible Book", () => {
        new CreateBookModal(this.app, this).open();
      });
      this.ribbonIcons.push(icon);
    }

    if (this.settings.showSeriesRibbonIcon) {
      const icon = this.addRibbonIcon("library", "Add Audible Series", () => {
        new CreateSeriesModal(this.app, this).open();
      });
      this.ribbonIcons.push(icon);
    }

    if (this.settings.showAuthorRibbonIcon) {
      const icon = this.addRibbonIcon("user", "Add Audible Author", () => {
        new CreateAuthorModal(this.app, this).open();
      });
      this.ribbonIcons.push(icon);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async createBookFromAudible(
    url: string,
    library: LibrarySettings,
    statusOverride?: string,
    ratingOverride?: string,
    overwriteOverride?: boolean,
    createAuthorPage?: boolean,
    createSeriesPage?: boolean
  ) {
    const s = this.settings;
    const booksRoot = safeNormalizePath(library.booksRoot);

    // Ensure folder exists
    const folder = this.app.vault.getAbstractFileByPath(booksRoot);
    if (!folder) {
      await this.app.vault.createFolder(booksRoot);
    }

    new Notice("Fetching Audible page…");

    const data = await scrapeAudible(url, library, s, statusOverride, ratingOverride);

    // Automatic Author Page Creation
    const authorTplPath = s.authorTemplatePath;
    const authorFolderPath = safeNormalizePath(library.authorsFolder);

    if (createAuthorPage && authorTplPath && authorFolderPath && data.authors?.length) {
      for (const author of data.authors) {
        if (author.url) {
          const authorUrl = author.url.startsWith("http") ? author.url : `https://www.audible.com${author.url}`;
          await this.createAuthorFromAudible(authorUrl, library);
        }
      }
      // Change links to internal Obsidian links for the book note
      (data as any).authors_md_override = data.authors.map(a => `[[${a.name}]]`).join(",  \n");
    }

    // Automatic Series Page Creation
    const seriesTplPath = s.seriesTemplatePath;
    const seriesFolderPath = safeNormalizePath(library.seriesFolder);
    if (createSeriesPage && seriesTplPath && seriesFolderPath && data.series?.url) {
      const seriesUrl = data.series.url.startsWith("http") ? data.series.url : `https://www.audible.com${data.series.url}`;
      await this.createSeriesFromAudible(seriesUrl, library);
      // Change series field to internal link
      data.series.name = `[[${data.series.name}]]`;
    }

    const tpl = await readTemplate(this.app, s.bookTemplatePath);
    const md = renderFromTemplate(tpl, data);

    const filePath = safeNormalizePath(`${booksRoot}/${data.title}.md`);

    const existing = this.app.vault.getAbstractFileByPath(filePath);
    const shouldOverwrite = overwriteOverride ?? s.overwriteIfExists;

    if (existing && existing instanceof TFile) {
      if (!shouldOverwrite) {
        new Notice(`File exists: ${filePath}`);
        if (s.openCreatedFile) {
          await this.app.workspace.getLeaf(false).openFile(existing);
        }
        return;
      }
      // Overwrite
      await this.app.vault.modify(existing, md);
      new Notice(`Updated: ${data.title}`);
    } else {
      // Create new
      await this.app.vault.create(filePath, md);
      new Notice(`Created: ${data.title}`);
    }

    if (s.openCreatedFile) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file && file instanceof TFile) {
        await this.app.workspace.getLeaf(false).openFile(file);
      }
    }
  }

  async createAuthorFromAudible(url: string, library: LibrarySettings, ratingOverride?: string, overwriteOverride?: boolean) {
    try {
      const folderPath = safeNormalizePath(library.authorsFolder);
      if (!folderPath) {
        new Notice("Author folder not defined for this library. Author page creation skipped.");
        return;
      }

      new Notice("Scraping author...");
      const data = await scrapeAuthor(url, library, this.settings, ratingOverride);
      const templatePath = this.settings.authorTemplatePath;
      if (!templatePath) {
        new Notice("Author template path not defined. Author page creation skipped.");
        return;
      }

      const template = await readTemplate(this.app, templatePath);
      const content = renderFromTemplate(template, data);

      const fileName = `${data.author}.md`;
      const filePath = `${folderPath}/${fileName}`;

      let folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!folder) await this.app.vault.createFolder(folderPath);

      const existing = this.app.vault.getAbstractFileByPath(filePath);
      const shouldOverwrite = overwriteOverride ?? this.settings.overwriteIfExists;

      if (existing && existing instanceof TFile) {
        if (!shouldOverwrite) {
          new Notice("Author page already exists.");
          return;
        }
        await this.app.vault.modify(existing, content);
        new Notice(`Updated author page: ${data.author}`);
      } else {
        await this.app.vault.create(filePath, content);
        new Notice(`Author page created: ${data.author}`);
      }

      if (this.settings.openCreatedFile) {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
      }
    } catch (e: any) {
      console.error(e);
      new Notice(`Error: ${e.message}`);
    }
  }

  async createSeriesFromAudible(url: string, library: LibrarySettings, ratingOverride?: string, overwriteOverride?: boolean) {
    try {
      const folderPath = safeNormalizePath(library.seriesFolder);
      if (!folderPath) {
        new Notice("Series folder not defined for this library. Series page creation skipped.");
        return;
      }

      new Notice("Scraping series...");
      const data = await scrapeSeriesPage(url, this.settings, library.name, ratingOverride);

      const tplPath = this.settings.seriesTemplatePath;
      if (!tplPath) {
        new Notice("Series template path not defined. Series page creation skipped.");
        return;
      }

      const tpl = await readTemplate(this.app, tplPath);
      const content = renderFromTemplate(tpl, data);

      const fileName = `${normalizeTitle(data.series)}.md`;
      const filePath = `${folderPath}/${fileName}`;

      let folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!folder) await this.app.vault.createFolder(folderPath);

      const existing = this.app.vault.getAbstractFileByPath(filePath);
      const shouldOverwrite = overwriteOverride ?? this.settings.overwriteIfExists;

      if (existing && existing instanceof TFile) {
        if (!shouldOverwrite) {
          new Notice("Series page already exists.");
          return;
        }
        await this.app.vault.modify(existing, content);
        new Notice(`Updated series page: ${data.series}`);
      } else {
        await this.app.vault.create(filePath, content);
        new Notice(`Series page created: ${data.series}`);
      }

      if (this.settings.openCreatedFile) {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
      }
    } catch (e: any) {
      console.error(e);
      new Notice(`Error: ${e.message}`);
    }
  }
}
