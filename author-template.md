---
url: "{{url}}"
author: "{{author_plain}}"
category: "{{category}}"
rating: {{rating}}
image_url: "{{image_url}}"
---


# **`=default(this.author, "—")`**

## Overview

> [!book] `=default(this.author, "—")`
> <img src="{{image_url}}" width="300" style="border-radius: 6px;">
>
>
> **Author:** {{author_md}}
> **URL:** {{url}}
>
> **Category:** `=default(this.category, "—")`
>
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


## Description:
{{description}}

---

## Notes:
- 

---

## Tags: 
#Author #<% tp.frontmatter.category.replace(/\s+/g, "-").toLowerCase() %>

