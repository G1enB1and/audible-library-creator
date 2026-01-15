---
type: {{type}}
title: "{{title}}"
url: "{{url}}"
author: "{{authors_plain}}"
series: "{{series_plain}}"
book: "{{book_md}}"
category: "{{category}}"
status: "{{status}}"
acquired: "{{acquired}}"
source: "{{source}}"
rating: "{{rating}}"
cover_url: "{{cover_url}}"
tags: {{tags_yaml}}
---


# **`=default(this.title, "—")`**

## Overview

> [!book] 📖 `=default(this.title, "—")`
> <img src="{{cover_url}}" width="300" style="border-radius: 6px;">
>
> **Title:** [{{title}}]({{url}})
>
> **Author:** {{authors_md}}
>
> **Series:** {{series_md}}
> **Book:** `=default(this.book, "—")`
>
> **Category:** `=default(this.category, "—")`
>
> **Status:** `=default(this.status, "—")`  
> **Rating:** `=default(this.rating, "—")`


## Description:
{{description}}

---

## My Thoughts:

### Overall:
-

### Daily Reflections

```dataviewjs
const dailyFolder = "Daily Notes";
const bookTitle = dv.current().file.name;

function norm(s) {
  return (s ?? "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u00A0\u202F\u2007\u2009]/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isHeadingLine(line) {
  return /^\s{0,3}#{1,6}\s+/.test(line);
}

function isListItem(line) {
  return /^\s*[-*+]\s+/.test(line) || /^\s*[-*+]\s*$/.test(line) || /^\s*[-*+]\s*\[[ xX]\]\s*/.test(line);
}

function listItemContent(line) {
  let s = line.replace(/^\s*[-*+]\s*/, "");
  s = s.replace(/^\[[ xX]\]\s*/, "");
  return norm(s);
}

const pages = dv.pages(`"${dailyFolder}"`)
  .where(p => p.file.outlinks?.some(l => l.path === dv.current().file.path))
  .sort(p => p.file.name, "desc")
  .array();

async function run() {
  const embeds = [];

  for (const p of pages) {
    const dm = p.file.name.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dm) continue;
    const d = dm[1];

    const targetHeadingText = norm(`${d} - ${bookTitle} - Thoughts`);

    const text = await dv.io.load(p.file.path);
    const lines = text.split(/\r?\n/);

    let startIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s{0,3}#{2,6}\s+(.*)$/);
      if (!m) continue;

      const headingText = norm(m[1]);
      if (headingText === targetHeadingText) {
        startIdx = i;
        break;
      }
    }
    if (startIdx === -1) continue;

    let j = startIdx + 1;

    while (j < lines.length && norm(lines[j]) === "" && !isHeadingLine(lines[j])) j++;

    if (j >= lines.length || isHeadingLine(lines[j])) continue;

    if (!isListItem(lines[j])) continue;

    let hasRealBullet = false;
    while (j < lines.length && !isHeadingLine(lines[j]) && isListItem(lines[j])) {
      const content = listItemContent(lines[j]);
      if (content.length > 0) hasRealBullet = true;
      j++;
    }

    if (!hasRealBullet) continue;

    embeds.push(`![[${p.file.path}#${d} - ${bookTitle} - Thoughts]]`);
  }

  if (!embeds.length) {
    dv.paragraph("_No dated reflections found yet._");
  } else {
    dv.paragraph(embeds.join("\n\n"));
  }
}

run();
```

---

## Tags:
{{tags}}

