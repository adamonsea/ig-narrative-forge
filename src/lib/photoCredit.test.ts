// @ts-nocheck -- run with: bun test ./src/lib/photoCredit.test.ts
import { describe, it, expect } from "bun:test";
import { isPublisherPhoto, photoCreditLabel } from "./photoCredit";

const OWN = ["fpoywkjgdapgjtdeooak.supabase.co", "curatr.pro"];

describe("publisher photo credits", () => {
  it("our own stored pictures are never credited", () => {
    expect(isPublisherPhoto("https://fpoywkjgdapgjtdeooak.supabase.co/storage/v1/object/public/a.webp", OWN)).toBe(false);
    expect(photoCreditLabel("https://fpoywkjgdapgjtdeooak.supabase.co/x.webp", "Jane", "Pub", OWN)).toBeNull();
  });

  it("uses the credit the source site gives", () => {
    expect(photoCreditLabel("https://eastbourne.news/img/a.jpg", "Jane Smith", "Eastbourne News", OWN)).toBe("Photo: Jane Smith");
  });

  it("falls back to the publisher's name when the site names nobody", () => {
    expect(photoCreditLabel("https://eastbourne.news/img/a.jpg", null, "Eastbourne News", OWN)).toBe("Photo: Eastbourne News");
  });

  it("no cover, no credit", () => {
    expect(photoCreditLabel(null, "Jane", "Pub", OWN)).toBeNull();
  });
});
