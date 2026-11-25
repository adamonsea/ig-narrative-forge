import { describe, expect, it } from "vitest";
import { handleToInternal, internalToHandle, HANDLE_PATTERN } from "@/lib/feedHandle";

describe("feed handles", () => {
  it("maps /@slug pages onto the existing /feed routes", () => {
    expect(handleToInternal("/@lisbon")).toBe("/feed/lisbon");
    expect(handleToInternal("/@lisbon/story/abc")).toBe("/feed/lisbon/story/abc");
    expect(handleToInternal("/feed/lisbon")).toBeNull();
  });
  it("shows /feed pages as /@slug, but leaves legacy /feed/topic links alone", () => {
    expect(internalToHandle("/feed/eastbourne/daily/2026-11-25")).toBe("/@eastbourne/daily/2026-11-25");
    expect(internalToHandle("/feed/topic/eastbourne")).toBeNull();
    expect(internalToHandle("/dashboard")).toBeNull();
  });
  it("accepts only 3–30 lowercase letters, digits and hyphens", () => {
    expect(HANDLE_PATTERN.test("abc")).toBe(true);
    expect(HANDLE_PATTERN.test("ab")).toBe(false);
    expect(HANDLE_PATTERN.test("a".repeat(31))).toBe(false);
    expect(HANDLE_PATTERN.test("Lisbon")).toBe(false);
    expect(HANDLE_PATTERN.test("lis_bon")).toBe(false);
  });
});
