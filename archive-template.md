---
type: archive
view: grid
cover_size: 120
show_title: true
show_author: true
show_series: true
show_rating: true
columns: 5

filter_category: ""
filter_status: ""
filter_author: ""
filter_series: ""
filter_source: ""
filter_tags: []
filter_rating: ">=0"
---

# 📚 =this.file.name

## Controls
- View: `=this.view`
- Covers: `=this.cover_size`px
- Columns: `=this.columns`

## Library

```dataviewjs
const cfg = dv.current();
const plugin = app.plugins.plugins['audible-library-creator'];
const normalize = (p) => p ? p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : "";
const currentPath = normalize(cfg.file.path);

const library = plugin?.settings.libraries.find(l => normalize(l.archivePath) === currentPath);

if (!library) {
  dv.el("div", `> [!CAUTION] Library Configuration Required\n> This archive file is not currently registered to any library.\n>\n> **To fix this:**\n> 1. Go to **Settings** > **Audible Library Creator**.\n> 2. Locate your library in the **Libraries** list.\n> 3. Ensure the **Archive path** field matches this file's path exactly: \` ${cfg.file.path} \`.\n> 4. Once matched, this archive will load automatically.`, {cls: "alc-setup-notice"});
} else {
  const booksFolder = library.booksRoot;

  // Get books
  let books = dv.pages(`"${booksFolder}"`)
    .where(p => p.type === "book");

  // Filters
  if (cfg.filter_category)
    books = books.where(b => b.category === cfg.filter_category);

  if (cfg.filter_status)
    books = books.where(b => b.status === cfg.filter_status);

  if (cfg.filter_author)
    books = books.where(b => b.author?.includes(cfg.filter_author));

  if (cfg.filter_series)
    books = books.where(b => b.series === cfg.filter_series);

  if (cfg.filter_tags?.length)
    books = books.where(b => 
      cfg.filter_tags.every(t => b.tags?.includes(t))
    );

  // Render grid
  const cols = cfg.columns || 5;

  dv.el("div","",{
    cls: "alc-grid",
    attr: {
      style: `
        display:grid;
        grid-template-columns:repeat(${cols},1fr);
        gap:16px;
      `
    }
  });

  for (let b of books) {

    const card = dv.el("div","",{
      cls:"alc-card",
      attr:{style:"text-align:center"}
    });

    if (b.cover_url) {
      dv.el("img","",{
        parent:card,
        attr:{
          src:b.cover_url,
          width:cfg.cover_size || 120,
          style:"border-radius:6px"
        }
      });
    }

    if (cfg.show_title)
      dv.el("div",`**${b.title}**`,{parent:card});

    if (cfg.show_author)
      dv.el("div",b.author,{parent:card});

    if (cfg.show_series && b.series)
      dv.el("div",b.series,{parent:card});
  }
}
```

