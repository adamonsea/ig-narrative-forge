// run with: bun test ./src/lib/validation.test.ts
import { describe, expect, it } from "bun:test";
import {
  newsletterSchema,
  topicSchema,
  contentSchema,
  searchSchema,
  userProfileSchema,
} from "./validation";

describe("newsletter sign-up validation", () => {
  it("accepts a plain email", () => {
    expect(newsletterSchema.safeParse({ email: "reader@example.com" }).success).toBe(true);
  });
  it("rejects text that is too short to be an email", () => {
    const res = newsletterSchema.safeParse({ email: "nope" });
    expect(res.success).toBe(false);
    expect(res.error!.issues[0]!.message).toContain("at least 5 characters");
  });
  it("rejects text that is not an email", () => {
    const res = newsletterSchema.safeParse({ email: "not an email" });
    expect(res.success).toBe(false);
    expect(res.error!.issues[0]!.message).toContain("valid email");
  });
  it("rejects an email carrying markup", () => {
    expect(newsletterSchema.safeParse({ email: "a<b@example.com" }).success).toBe(false);
  });
  it("drops a blank name instead of storing spaces", () => {
    const res = newsletterSchema.safeParse({ email: "reader@example.com", name: "   " });
    expect(res.success).toBe(true);
    expect(res.data!.name).toBeUndefined();
  });
});

describe("feed creation validation", () => {
  it("requires a feed name", () => {
    expect(topicSchema.safeParse({ name: "" }).success).toBe(false);
  });
  it("rejects a feed name carrying markup", () => {
    expect(topicSchema.safeParse({ name: "Eastbourne <script>" }).success).toBe(false);
  });
  it("defaults missing keywords to an empty list", () => {
    const res = topicSchema.safeParse({ name: "Eastbourne" });
    expect(res.success).toBe(true);
    expect(res.data!.keywords).toEqual([]);
  });
  it("refuses more than 20 keywords", () => {
    const keywords = Array.from({ length: 21 }, (_, i) => `k${i}`);
    expect(topicSchema.safeParse({ name: "Eastbourne", keywords }).success).toBe(false);
  });
});

describe("story content validation", () => {
  it("requires a title", () => {
    expect(contentSchema.safeParse({ title: "", content: "0123456789ab" }).success).toBe(false);
  });
  it("requires at least 10 characters of content", () => {
    expect(contentSchema.safeParse({ title: "T", content: "too short" }).success).toBe(false);
  });
  it("accepts a complete story", () => {
    expect(contentSchema.safeParse({ title: "T", content: "0123456789ab" }).success).toBe(true);
  });
});

describe("search validation", () => {
  it("defaults missing filters to an empty object", () => {
    const res = searchSchema.safeParse({ query: "harbour" });
    expect(res.success).toBe(true);
    expect(res.data!.filters).toEqual({});
  });
  it("keeps filters that are supplied", () => {
    const res = searchSchema.safeParse({ query: "harbour", filters: { category: "council" } });
    expect(res.success).toBe(true);
    expect(res.data!.filters).toEqual({ category: "council" });
  });
  it("rejects a query carrying markup", () => {
    expect(searchSchema.safeParse({ query: "harbour <b>" }).success).toBe(false);
  });
});

describe("profile validation", () => {
  it("accepts a display name and bio", () => {
    expect(userProfileSchema.safeParse({ display_name: "Adam", bio: "Curator" }).success).toBe(true);
  });
  it("rejects a display name over 100 characters", () => {
    expect(userProfileSchema.safeParse({ display_name: "a".repeat(101) }).success).toBe(false);
  });
});
