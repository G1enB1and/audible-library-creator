import { App, PluginSettingTab, Setting } from "obsidian";
import type AudibleLibraryCreatorPlugin from "./main";

export type RatingStyle = "emoji" | "classic";

export interface TagRules {
  baseTags: string[];
  categoryTags: Record<string, string[]>;
}

export interface LibrarySettings {
  id: string;
  name: string;
  booksRoot: string;
  authorsFolder: string;
  seriesFolder: string;
  archivePath: string;
}

export interface AudibleLibraryCreatorSettings {
  // Global templates (vault-relative)
  bookTemplatePath: string;
  authorTemplatePath: string;
  seriesTemplatePath: string;
  archiveTemplatePath: string;

  // Libraries
  libraries: LibrarySettings[];
  activeLibraryId: string;

  // Defaults
  defaultCategory: string;
  defaultStatus: string;
  defaultAcquired: string;
  defaultSource: string;

  // Rating
  defaultRatingNumber: number; // ex 3 or 3.5
  ratingStyle: RatingStyle;
  allowHalfStars: boolean;

  // Features
  createSeriesPages: boolean;

  openCreatedFile: boolean;
  overwriteIfExists: boolean;

  // Tags and rules
  tagRulesJson: string;
}

export const DEFAULT_SETTINGS: AudibleLibraryCreatorSettings = {
  bookTemplatePath: "Templates/BookTemplate.md",
  authorTemplatePath: "Templates/AuthorTemplate.md",
  seriesTemplatePath: "Templates/SeriesTemplate.md",
  archiveTemplatePath: "Templates/ArchiveTemplate.md",

  libraries: [
    {
      id: "default",
      name: "Main Library",
      booksRoot: "Books",
      authorsFolder: "Books/Authors",
      seriesFolder: "Books/Series",
      archivePath: "Books/Archive/!Archive.md"
    }
  ],
  activeLibraryId: "default",

  defaultCategory: "Fiction",
  defaultStatus: "",
  defaultAcquired: "Owned",
  defaultSource: "Audible",

  defaultRatingNumber: 3,
  ratingStyle: "emoji",
  allowHalfStars: true,

  createSeriesPages: false,

  openCreatedFile: true,
  overwriteIfExists: false,

  tagRulesJson: JSON.stringify(
    {
      baseTags: ["Book", "Audible"],
      categoryTags: {
        "Adult Fantasy": ["Adult", "Fantasy", "Erotic"]
      }
    },
    null,
    2
  )
};

export function safeNormalizePath(p: string): string {
  return (p || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .trim();
}

export function parseTagRules(jsonText: string): { rules: TagRules; error: string } {
  try {
    const raw = JSON.parse(jsonText);
    const baseTags = Array.isArray(raw?.baseTags) ? raw.baseTags.map(String) : [];
    const categoryTagsRaw = raw?.categoryTags && typeof raw.categoryTags === "object" ? raw.categoryTags : {};
    const categoryTags: Record<string, string[]> = {};

    for (const k of Object.keys(categoryTagsRaw)) {
      const v = categoryTagsRaw[k];
      if (!Array.isArray(v)) continue;
      categoryTags[k] = v.map(String);
    }

    return {
      rules: { baseTags, categoryTags },
      error: ""
    };
  } catch (e: any) {
    return {
      rules: { baseTags: [], categoryTags: {} },
      error: e?.message || "Invalid JSON"
    };
  }
}

export function dedupeKeepOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of items) {
    const t = (x || "").trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function buildTagsForCategory(category: string, rules: TagRules): string[] {
  const tags: string[] = [];
  tags.push(...(rules.baseTags || []));

  const key = (category || "").trim();
  if (key && rules.categoryTags && rules.categoryTags[key]) {
    tags.push(...rules.categoryTags[key]);
  }

  return dedupeKeepOrder(tags);
}

export class AudibleLibraryCreatorSettingTab extends PluginSettingTab {
  plugin: AudibleLibraryCreatorPlugin;

  constructor(app: App, plugin: AudibleLibraryCreatorPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Audible Library Creator" });

    // Fake tabs: dropdown to select section
    const sections: Array<{ key: string; label: string }> = [
      { key: "paths", label: "Paths & Templates" },
      { key: "defaults", label: "Defaults" },
      { key: "features", label: "Features" },
      { key: "tags", label: "Tags & Category Rules" },
      { key: "advanced", label: "Advanced / Importers" }
    ];

    let selected = "paths";

    const render = () => {
      containerEl.findAll("div.alc-section").forEach(el => el.remove());
      const sectionWrap = containerEl.createDiv({ cls: "alc-section" });

      if (selected === "paths") this.renderPaths(sectionWrap);
      if (selected === "defaults") this.renderDefaults(sectionWrap);
      if (selected === "features") this.renderFeatures(sectionWrap);
      if (selected === "tags") this.renderTags(sectionWrap);
      if (selected === "advanced") this.renderAdvanced(sectionWrap);
    };

    new Setting(containerEl)
      .setName("Settings section")
      .setDesc("Choose which settings group to view.")
      .addDropdown(dd => {
        for (const s of sections) dd.addOption(s.key, s.label);
        dd.setValue(selected);
        dd.onChange(v => {
          selected = v;
          render();
        });
      });

    render();
  }

  private renderPaths(root: HTMLElement) {
    root.createEl("h3", { text: "Templates" });

    const s = this.plugin.settings;

    const addTemplatePath = (
      name: string,
      desc: string,
      key: keyof AudibleLibraryCreatorSettings
    ) => {
      new Setting(root)
        .setName(name)
        .setDesc(desc)
        .addText(t => {
          t.setPlaceholder("Templates/MyTemplate.md");
          t.setValue(String(s[key] || ""));
          t.onChange(async v => {
            // @ts-ignore
            this.plugin.settings[key] = safeNormalizePath(v);
            await this.plugin.saveSettings();
          });
        });
    };

    addTemplatePath("Book template path", "Template for book notes.", "bookTemplatePath");
    addTemplatePath("Author template path", "Template for author notes (optional).", "authorTemplatePath");
    addTemplatePath("Series template path", "Template for series notes (optional).", "seriesTemplatePath");
    addTemplatePath("Archive template path", "Template for archive notes (optional).", "archiveTemplatePath");

    root.createEl("h3", { text: "Libraries" });
    root.createEl("p", { text: "Configure separate paths for different categories/genres. Each library has its own folders for books, authors, and series, and its own archive file." });

    s.libraries.forEach((lib, index) => {
      const libContainer = root.createDiv({ cls: "alc-library-item" });
      libContainer.style.border = "1px solid var(--background-modifier-border)";
      libContainer.style.padding = "10px";
      libContainer.style.marginBottom = "10px";
      libContainer.style.borderRadius = "8px";

      new Setting(libContainer)
        .setName(`Library: ${lib.name}`)
        .addExtraButton(cb => {
          cb.setIcon("trash")
            .setTooltip("Delete this library")
            .onClick(async () => {
              if (s.libraries.length <= 1) {
                // @ts-ignore
                new Notice("You must have at least one library.");
                return;
              }
              s.libraries.splice(index, 1);
              if (s.activeLibraryId === lib.id) {
                s.activeLibraryId = s.libraries[0].id;
              }
              await this.plugin.saveSettings();
              this.display();
            });
        });

      new Setting(libContainer)
        .setName("Library name")
        .addText(t => {
          t.setValue(lib.name);
          t.onChange(async v => {
            lib.name = v.trim();
            await this.plugin.saveSettings();
          });
        });

      new Setting(libContainer)
        .setName("Books root")
        .setDesc("Where book notes are created.")
        .addText(t => {
          t.setValue(lib.booksRoot);
          t.onChange(async v => {
            lib.booksRoot = safeNormalizePath(v);
            await this.plugin.saveSettings();
          });
        });

      new Setting(libContainer)
        .setName("Authors folder")
        .addText(t => {
          t.setValue(lib.authorsFolder);
          t.onChange(async v => {
            lib.authorsFolder = safeNormalizePath(v);
            await this.plugin.saveSettings();
          });
        });

      new Setting(libContainer)
        .setName("Series folder")
        .addText(t => {
          t.setValue(lib.seriesFolder);
          t.onChange(async v => {
            lib.seriesFolder = safeNormalizePath(v);
            await this.plugin.saveSettings();
          });
        });

      new Setting(libContainer)
        .setName("Archive path")
        .setDesc("Path to the archive .md file.")
        .addText(t => {
          t.setValue(lib.archivePath);
          t.onChange(async v => {
            lib.archivePath = safeNormalizePath(v);
            await this.plugin.saveSettings();
          });
        });
    });

    new Setting(root)
      .addButton(btn => {
        btn.setButtonText("Add Library")
          .setCta()
          .onClick(async () => {
            const nextId = "lib-" + Date.now();
            s.libraries.push({
              id: nextId,
              name: "New Library",
              booksRoot: "Books/New",
              authorsFolder: "Books/New/Authors",
              seriesFolder: "Books/New/Series",
              archivePath: "Books/New/!Archive.md"
            });
            await this.plugin.saveSettings();
            this.display();
          });
      });
  }

  private renderDefaults(root: HTMLElement) {
    root.createEl("h3", { text: "Defaults" });

    const s = this.plugin.settings;

    new Setting(root)
      .setName("Default category")
      .setDesc("Used when category is not provided in the modal.")
      .addText(t => {
        t.setValue(s.defaultCategory || "");
        t.onChange(async v => {
          this.plugin.settings.defaultCategory = v.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(root)
      .setName("Default status")
      .setDesc("Blank by default is recommended for bulk importing.")
      .addText(t => {
        t.setValue(s.defaultStatus || "");
        t.onChange(async v => {
          this.plugin.settings.defaultStatus = v.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(root)
      .setName("Default acquired")
      .setDesc("Example: Owned, Wish Listed.")
      .addText(t => {
        t.setValue(s.defaultAcquired || "");
        t.onChange(async v => {
          this.plugin.settings.defaultAcquired = v.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(root)
      .setName("Default source")
      .setDesc("Example: Audible.")
      .addText(t => {
        t.setValue(s.defaultSource || "");
        t.onChange(async v => {
          this.plugin.settings.defaultSource = v.trim();
          await this.plugin.saveSettings();
        });
      });

    root.createEl("h4", { text: "Rating" });

    new Setting(root)
      .setName("Default rating number")
      .setDesc("Example: 3 or 3.5")
      .addText(t => {
        t.setValue(String(s.defaultRatingNumber));
        t.onChange(async v => {
          const n = Number(v);
          if (!Number.isFinite(n)) return;
          this.plugin.settings.defaultRatingNumber = n;
          await this.plugin.saveSettings();
        });
      });

    new Setting(root)
      .setName("Rating style")
      .setDesc("Emoji stars or classic symbols.")
      .addDropdown(dd => {
        dd.addOption("emoji", "Emoji (⭐)");
        dd.addOption("classic", "Classic (★)");
        dd.setValue(s.ratingStyle);
        dd.onChange(async v => {
          this.plugin.settings.ratingStyle = v as RatingStyle;
          await this.plugin.saveSettings();
        });
      });

    new Setting(root)
      .setName("Allow half stars")
      .setDesc("If enabled, 3.5 can render as 3 and a half.")
      .addToggle(tg => {
        tg.setValue(s.allowHalfStars);
        tg.onChange(async v => {
          this.plugin.settings.allowHalfStars = v;
          await this.plugin.saveSettings();
        });
      });
  }

  private renderFeatures(root: HTMLElement) {
    root.createEl("h3", { text: "Features" });

    const s = this.plugin.settings;

    new Setting(root)
      .setName("Create series pages")
      .setDesc("Optional, not implemented yet (placeholder).")
      .addToggle(tg => {
        tg.setValue(s.createSeriesPages);
        tg.onChange(async v => {
          this.plugin.settings.createSeriesPages = v;
          await this.plugin.saveSettings();
        });
      });

    root.createEl("h4", { text: "Creation behavior" });

    new Setting(root)
      .setName("Open created file automatically")
      .addToggle(tg => {
        tg.setValue(s.openCreatedFile);
        tg.onChange(async v => {
          this.plugin.settings.openCreatedFile = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(root)
      .setName("Overwrite if exists")
      .setDesc("If a file already exists, replace it.")
      .addToggle(tg => {
        tg.setValue(s.overwriteIfExists);
        tg.onChange(async v => {
          this.plugin.settings.overwriteIfExists = v;
          await this.plugin.saveSettings();
        });
      });
  }

  private renderTags(root: HTMLElement) {
    root.createEl("h3", { text: "Tags & Category Rules" });

    const s = this.plugin.settings;

    const parsed = parseTagRules(s.tagRulesJson);
    if (parsed.error) {
      root.createEl("p", { text: `JSON error: ${parsed.error}` });
    }

    new Setting(root)
      .setName("Tag rules (JSON)")
      .setDesc("Controls base tags and per-category tags.")
      .addTextArea(ta => {
        ta.setValue(s.tagRulesJson);
        ta.inputEl.rows = 14;
        ta.onChange(async v => {
          this.plugin.settings.tagRulesJson = v;
          await this.plugin.saveSettings();
        });
      });
  }

  private renderAdvanced(root: HTMLElement) {
    root.createEl("h3", { text: "Advanced / Importers" });
    root.createEl("p", { text: "Coming soon: batch import from library and wishlist pages." });
  }
}
