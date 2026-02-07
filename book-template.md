---
type: {{type}}
title: "{{title}}"
url: "{{url}}"
author: "{{authors_plain}}"
narrator: "{{narrators_plain}}"
series: "{{series_plain}}"
book: "{{book_md}}"
publisher: "{{publisher}}"
source: "{{source}}"
cover_url: "{{cover_url}}"
length: "{{length}}"
release_date: "{{release_date}}"
category: "{{category}}"
acquired: "{{acquired}}"
status: "{{status}}"
rating: {{rating}}
start_date: "{{start_date}}"
finish_date: "{{finish_date}}"
tags: {{tags_yaml}}
---


# **`=default(this.title, "—")`**

## Overview

> [!book] `=default(this.title, "—")`
> <img src="{{cover_url}}" width="300" style="border-radius: 6px;">
>
> **Title:** [{{title}}]({{url}})
>
> **Author:** {{authors_md}}
> **Narrator:** {{narrators_md}}
> 
> **Series:** {{series_md}}
> **Book:** `=default(this.book, "—")`
> **Length:** {{length}}
> 
> **Publisher:** {{publisher}}
> 
> **Category:** `=default(this.category, "—")`
>
> **Status:** `=default(this.status, "—")`  
> **Rating:** `$= (() => { 
  const r = Number(dv.current().rating); 
  const max = 5; 
  const s = app.plugins.plugins["audible-library-creator"]?.settings || {}; 
  const style = s.ratingStyle || "classic"; 
  const allowHalf = s.allowHalfStars ?? true; 
  const full = style === "emoji" ? "⭐" : "★"; 
  const half = style === "emoji" ? "½" : "⯪"; 
  const empty = style === "emoji" ? "🌑" : "✰"; 
  const rounded = allowHalf ? Math.round(r * 2) / 2 : Math.round(r); 
  const fullCount = Math.floor(rounded); 
  const hasHalf = allowHalf && (rounded % 1 !== 0); 
  const emptyCount = Math.max(0, max - fullCount - (hasHalf ? 1 : 0)); 
  return full.repeat(Math.max(0, fullCount)) + (hasHalf ? half : "") + empty.repeat(Math.max(0, emptyCount)); 
})()`
> **Start Date:** {{start_date}}
> **Finish Date:** {{finish_date}}


## Description:
{{description}}

---

## My Thoughts:

### Overall:
-

### Daily Reflections

[➕ Add thought to Book](obsidian://quickadd?choice=Add%20Book%20Thought)


---

## Tags:
{{tags}}

