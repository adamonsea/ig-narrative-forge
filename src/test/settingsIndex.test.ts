import { describe, expect, it } from "vitest";
import { findSettings, settingAnchor, SETTINGS_INDEX } from "@/lib/settingsIndex";
import { visibleSettingsSections } from "@/lib/settingsSections";

const all = visibleSettingsSections(true, true).map((s) => s.id);

describe("Find a setting", () => {
  it("synonyms jump to the right row", () => {
    expect(findSettings("instagram", all)[0]?.anchor).toBe("social-captions");
    expect(findSettings("logo", all)[0]?.section).toBe("look");
    expect(findSettings("newsletter", all)[0]?.anchor).toBe("email-sign-ups");
    expect(findSettings("keywords", all)[0]?.section).toBe("coverage");
    expect(findSettings("donations", all)[0]?.section).toBe("extras");
    expect(SETTINGS_INDEX.some((s) => s.section === "share" && s.anchor === "donations")).toBe(false);
  });
  it("hides rows on pages the feed doesn't have", () => {
    const noEvents = visibleSettingsSections(false, false).map((s) => s.id);
    expect(findSettings("instagram", noEvents)).toEqual([]);
    expect(findSettings("how local", noEvents)).toEqual([]);
  });
  it("anchors are stable and unique per page", () => {
    expect(settingAnchor("Welcome line")).toBe("welcome-line");
    const keys = SETTINGS_INDEX.map((s) => `${s.section}#${s.anchor}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
