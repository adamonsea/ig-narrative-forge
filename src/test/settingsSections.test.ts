import { describe, expect, it } from "vitest";
import { resolveSettingsSection, settingsPath, visibleSettingsSections } from "@/lib/settingsSections";

describe("settings sections", () => {
  it("old ?section= links land on the new pages", () => {
    expect(resolveSettingsSection("identity")).toBe("general");
    expect(resolveSettingsSection("voice")).toBe("writing");
    expect(resolveSettingsSection("coverage")).toBe("coverage");
    expect(resolveSettingsSection("automation")).toBe("autopilot");
    expect(resolveSettingsSection("distribution")).toBe("share");
    expect(resolveSettingsSection("features")).toBe("extras");
  });
  it("unknown or missing sections open General", () => {
    expect(resolveSettingsSection(null)).toBe("general");
    expect(resolveSettingsSection("nope")).toBe("general");
  });
  it("Events page exists only when events are on", () => {
    expect(resolveSettingsSection("events", false)).toBe("general");
    expect(visibleSettingsSections(false).map((s) => s.id)).not.toContain("events");
    expect(visibleSettingsSections(true).map((s) => s.id)).toContain("events");
  });
  it("Pictures sits between Look and Coverage", () => {
    const ids = visibleSettingsSections(true).map((s) => s.id);
    expect(ids.indexOf("pictures")).toBe(ids.indexOf("look") + 1);
    expect(ids.indexOf("coverage")).toBe(ids.indexOf("pictures") + 1);
  });
  it("Local page exists only for regional feeds and follows Coverage", () => {
    expect(resolveSettingsSection("local", true, false)).toBe("coverage");
    expect(visibleSettingsSections(true, false).map((s) => s.id)).not.toContain("local");
    const ids = visibleSettingsSections(true, true).map((s) => s.id);
    expect(ids.indexOf("local")).toBe(ids.indexOf("coverage") + 1);
  });
  it("builds page links", () => {
    expect(settingsPath("eastbourne", "automation")).toBe("/dashboard/topic/eastbourne/settings/autopilot");
  });
});
