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



// -------------------- utils --------------------
function cleanUrl(u: string): string {
  const s = (u ?? "").trim();
  if (!s) return "";
  try {
    const url = new URL(s);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    // relative or malformed: just strip query/hash
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

// -------------------- scrape pieces (DOM-based) --------------------
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

function dedupeAuthorsByName(items: PersonLink[]): PersonLink[] {
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

  let result = dedupeAuthorsByName(authors);
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
    containers.push(...Array.from(doc.querySelectorAll(sel)));
  }

  // also capture nearby parents of text nodes containing "By" / "Written by"
  // We’ll scan elements whose text contains these keywords and that have /author/ links.
  const allEls = Array.from(doc.querySelectorAll("div,span,section"));
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
      return { name: a.name, url: cleanUrl(url) };
    });
    return dedupeAuthorsByName(result);
  }

  // if JSON-LD had no authors (rare), fall back to candidates
  const filled: PersonLink[] = [];
  for (const [k, v] of candidates.entries()) {
    const pretty = k.replace(/\b\w/g, c => c.toUpperCase());
    filled.push({ name: pretty, url: cleanUrl(v) });
  }
  return dedupeAuthorsByName(filled);
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
    doc.querySelectorAll("adbl-chip-group.product-topictag-impression adbl-chip")
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

function renderFromTemplate(tpl: string, data: BookData | AuthorData): string {
  let out = tpl;
  // avoid replaceAll for lib target friendliness
  const rep = (k: string, v: string) => { out = out.split(k).join(v); };

  if ("title" in data) {
    // Book Data
    const d = data as BookData;
    const authorsPlain = d.authors.map(a => a.name).filter(Boolean).join(", ");
    const authorsMd = d.authors.length
      ? d.authors.map(a => a.url ? `[${a.name}](${cleanUrl(a.url)})` : a.name).join(",  \n")
      : "_Unknown_";

    const seriesPlain = d.series?.name ?? "";
    const seriesMd = d.series
      ? (d.series.url ? `[${d.series.name}](${cleanUrl(d.series.url)})` : d.series.name)
      : "";
    const bookMd = d.series?.book ?? "";

    const tagsMd = d.tags.map(t => `#${t}`).join(" ");
    const tagsYaml = "[" + d.tags.map(t => JSON.stringify(t)).join(",") + "]";

    rep("{{title}}", d.title ?? "");
    rep("{{cover_url}}", cleanUrl(d.coverUrl ?? ""));
    rep("{{authors_md}}", authorsMd);
    rep("{{authors_plain}}", authorsPlain);
    rep("{{series_md}}", seriesMd);
    rep("{{series_plain}}", seriesPlain);
    rep("{{book_md}}", bookMd);
    rep("{{tags}}", tagsMd);
    rep("{{tags_yaml}}", tagsYaml);
    rep("{{status}}", d.status ?? "");
    rep("{{acquired}}", d.acquired ?? "");
    rep("{{source}}", d.source ?? "");
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
  const series = scrapeSeries(doc);

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
    series,
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

  // Author name from H1
  const authorName = doc.querySelector("h1")?.textContent?.trim() ?? "Unknown Author";

  // Image from profile picture or social meta
  let imageUrl = doc.querySelector("img.author-profile-picture")?.getAttribute("src") ?? "";
  if (!imageUrl) {
    imageUrl = doc.querySelector("meta[property='og:image']")?.getAttribute("content") ?? "";
  }

  // Description
  const description =
    doc.querySelector(".bc-expander-content")?.textContent?.trim() ??
    doc.querySelector(".author-description")?.textContent?.trim() ??
    doc.querySelector("#author-biography")?.textContent?.trim() ??
    doc.querySelector(".author-biography-text")?.textContent?.trim() ??
    doc.querySelector(".a-spacing-small .a-size-medium")?.textContent?.trim() ??
    "";

  return {
    author: authorName,
    url: cleanUrl(url),
    imageUrl: imageUrl,
    category: library.name,
    rating: ratingOverride ?? String(settings.defaultRatingNumber),
    description: description,
    type: "author"
  };
}



// -------------------- modal --------------------
class CreateBookModal extends Modal {
  plugin: AudibleLibraryCreatorPlugin;
  url = "";
  libraryId = "";
  status = "";
  rating = "";

  constructor(app: App, plugin: AudibleLibraryCreatorPlugin) {
    super(app);
    this.plugin = plugin;
    this.libraryId = plugin.settings.activeLibraryId;
    this.status = plugin.settings.defaultStatus;
    this.rating = String(plugin.settings.defaultRatingNumber);
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

              await this.plugin.createBookFromAudible(this.url, library, this.status, this.rating);
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

  constructor(app: App, plugin: AudibleLibraryCreatorPlugin) {
    super(app);
    this.plugin = plugin;
    this.libraryId = plugin.settings.activeLibraryId;
    this.rating = String(plugin.settings.defaultRatingNumber);
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
              await this.plugin.createAuthorFromAudible(this.url, library, this.rating);
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



// -------------------- plugin --------------------
export default class AudibleLibraryCreatorPlugin extends Plugin {
  settings!: AudibleLibraryCreatorSettings;


  async onload() {
    console.log(`Audible Library Creator v${this.manifest.version} loading...`);
    await this.loadSettings();

    this.addCommand({
      id: "create-book-from-audible",
      name: "Create Book from Audible",
      callback: () => new CreateBookModal(this.app, this).open()
    });

    this.addCommand({
      id: "create-author-from-audible",
      name: "Create Author from Audible",
      callback: () => new CreateAuthorModal(this.app, this).open()
    });

    this.addSettingTab(new AudibleLibraryCreatorSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async createBookFromAudible(url: string, library: LibrarySettings, statusOverride?: string, ratingOverride?: string) {
    const s = this.settings;
    const booksRoot = safeNormalizePath(library.booksRoot);

    // Ensure folder exists
    const folder = this.app.vault.getAbstractFileByPath(booksRoot);
    if (!folder) {
      await this.app.vault.createFolder(booksRoot);
    }

    new Notice("Fetching Audible page…");

    const data = await scrapeAudible(url, library, s, statusOverride, ratingOverride);

    const tpl = await readTemplate(this.app, s.bookTemplatePath);
    const md = renderFromTemplate(tpl, data);

    const filePath = safeNormalizePath(`${booksRoot}/${data.title}.md`);

    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing && existing instanceof TFile) {
      if (!s.overwriteIfExists) {
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

  async createAuthorFromAudible(url: string, library: LibrarySettings, ratingOverride?: string) {
    const s = this.settings;
    const authorsRoot = safeNormalizePath(library.authorsFolder);

    // Ensure folder exists
    const folder = this.app.vault.getAbstractFileByPath(authorsRoot);
    if (!folder) {
      await this.app.vault.createFolder(authorsRoot);
    }

    new Notice("Fetching Audible author page…");

    const data = await scrapeAuthor(url, library, s, ratingOverride);

    const tpl = await readTemplate(this.app, s.authorTemplatePath);
    const md = renderFromTemplate(tpl, data);

    const filePath = safeNormalizePath(`${authorsRoot}/${data.author}.md`);

    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing && existing instanceof TFile) {
      if (!s.overwriteIfExists) {
        new Notice(`File exists: ${filePath}`);
        return;
      }
      await this.app.vault.modify(existing, md);
      new Notice(`Updated Author: ${data.author}`);
    } else {
      await this.app.vault.create(filePath, md);
      new Notice(`Created Author: ${data.author}`);
    }

    if (s.openCreatedFile) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file && file instanceof TFile) {
        await this.app.workspace.getLeaf(false).openFile(file);
      }
    }
  }
}
