// run with: bun test ./src/lib/widgetBuilderSettings.test.ts
import { describe, it, expect } from "bun:test";
import {
  applySavedSources,
  decodeWidgetSettings,
  encodeWidgetSettings,
  parseWidgetSettings,
  settingsToSave,
  type WidgetBuilderSettings,
} from "./widgetBuilderSettings";

const base: WidgetBuilderSettings = {
  maxHeadlines: 3,
  theme: "dark",
  accent: "#3b82f6",
  width: "responsive",
  customTitle: "The Lisbon List",
  customAvatar: "",
  showSubscribe: true,
  frequency: "weekly",
  sources: ["Agenda LX", "Time Out"],
  featuredSources: ["Agenda LX"],
  featuredDaysBySource: { "Agenda LX": 3 },
  content: "both",
};

describe("widget builder saved settings", () => {
  it("remembers the News / What's on / Both choice and ignores anything else", () => {
    expect(parseWidgetSettings({ content: "events" }).content).toBe("events");
    expect(parseWidgetSettings({ content: "both" }).content).toBe("both");
    expect(parseWidgetSettings({ content: "everything" }).content).toBeUndefined();
  });

  it("a saved link brings back the same settings, including accented titles", () => {
    const saved = { ...base, customTitle: "Lisboa à noite" };
    expect(decodeWidgetSettings(encodeWidgetSettings(saved))).toEqual(saved);
  });

  it("drops unsafe or unknown values", () => {
    const parsed = parseWidgetSettings({
      maxHeadlines: 99,
      theme: "neon",
      accent: "red;background:url(x)",
      width: "9999px",
      customAvatar: "javascript:alert(1)",
      featuredDaysBySource: { A: 9, B: 2 },
    });
    expect(parsed).toEqual({ featuredDaysBySource: { B: 2 } });
  });

  it("returns nothing for a broken link", () => {
    expect(decodeWidgetSettings("not-a-real-link")).toBeNull();
  });

  it("leaves the publication list out when every publication is ticked", () => {
    expect(settingsToSave(base, true)).not.toHaveProperty("sources");
    expect(settingsToSave(base, false).sources).toEqual(["Agenda LX", "Time Out"]);
  });

  it("includes every current publication when none were saved", () => {
    expect(applySavedSources({}, ["A", "B", "C"])).toEqual({ sources: ["A", "B", "C"], featuredSources: [] });
  });

  it("keeps a saved choice but forgets publications no longer in the feed", () => {
    expect(
      applySavedSources({ sources: ["A", "Gone"], featuredSources: ["Gone", "A"] }, ["A", "B"]),
    ).toEqual({ sources: ["A"], featuredSources: ["A"] });
  });
});
