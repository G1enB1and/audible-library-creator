import { App, PluginSettingTab, Setting } from "obsidian";
import type AudibleLibraryCreatorPlugin from "./main";

export type RatingStyle = "emoji" | "classic";

export interface TagRules {
  baseTags: string[];
  categoryTags: Record<string, string[]>;
}

export interface AudibleLibraryCreatorSettings {
  // Paths and templates (vault-relative)
  booksRoot: string;
  authorsFolder: string;
  seriesFolder: string;
  archiveFolder: string;

  bookTemplatePath: string;
  authorTemplatePath: string;
  seriesTemplatePath: string;
  archiveTemplatePath: string;

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
  separateCategoriesIntoSubfolders: boolean;
  createArchivesPerSubfolder: boolean;
  createSeriesPages: boolean;

  openCreatedFile: boolean;
  overwriteIfExists: boolean;

  // Tags and rules
  tagRulesJson: string;
}

export const DEFAULT_SETTINGS: AudibleLibraryCreatorSettings = {
  booksRoot: "Books",
  authorsFolder: "Books/Authors",
  seriesFolder: "Books/Series",
  archiveFolder: "Books/Archive",

  bookTemplatePath: "Templates/BookTemplate.md",
  authorTemplatePath: "Templates/AuthorTemplate.md",
  seriesTemplatePath: "Templates/SeriesTemplate.md",
  archiveTemplatePath: "Templates/ArchiveTemplate.md",

  defaultCategory: "Fiction",
  defaultStatus: "",
  defaultAcquired: "Owned",
  defaultSource: "Audible",

  defaultRatingNumber: 3,
  ratingStyle: "emoji",
  allowHalfStars: true,

  separateCategoriesIntoSubfolders: true,
  createArchivesPerSubfolder: false,
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
    root.createEl("h3", { text: "Paths & Templates" });

    const s = this.plugin.settings;

    const addPath = (
      name: string,
      desc: string,
      key: keyof AudibleLibraryCreatorSettings
    ) => {
      new Setting(root)
        .setName(name)
        .setDesc(desc)
        .addText(t => {
          t.setPlaceholder("Vault-relative path");
          t.setValue(String(s[key] || ""));
          t.onChange(async v => {
            // @ts-ignore
            this.plugin.settings[key] = safeNormalizePath(v);
            await this.plugin.saveSettings();
          });
        });
    };

    addPath("Books root folder", "Where book notes are created (ex: Books).", "booksRoot");
    addPath("Authors folder", "Where author notes are created (ex: Books/Authors).", "authorsFolder");
    addPath("Series folder", "Where series notes are created (ex: Books/Series).", "seriesFolder");
    addPath("Archive folder", "Where archive notes are created (ex: Books/Archive).", "archiveFolder");

    addPath("Book template path", "Template for book notes.", "bookTemplatePath");
    addPath("Author template path", "Template for author notes (optional for now).", "authorTemplatePath");
    addPath("Series template path", "Template for series notes (optional for now).", "seriesTemplatePath");
    addPath("Archive template path", "Template for archive notes (optional for now).", "archiveTemplatePath");
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
      .setName("Separate categories into subfolders")
      .setDesc("Allows categories like Helpful Informative/Finance.")
      .addToggle(tg => {
        tg.setValue(s.separateCategoriesIntoSubfolders);
        tg.onChange(async v => {
          this.plugin.settings.separateCategoriesIntoSubfolders = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(root)
      .setName("Create archives per subfolder")
      .setDesc("Optional, not implemented yet (placeholder).")
      .addToggle(tg => {
        tg.setValue(s.createArchivesPerSubfolder);
        tg.onChange(async v => {
          this.plugin.settings.createArchivesPerSubfolder = v;
          await this.plugin.saveSettings();
        });
      });

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
