// @ts-nocheck -- run with: bun test ./src/lib/termLists.test.ts
import { describe, expect, test } from "bun:test";
import { addToList, dedupeTerms, removeTerm, visibleTerms, freshSuggestions } from "./termLists";

describe("What we look for lists", () => {
  test("a term already in the list in another case is not added twice", () => {
    const r = addToList({ more: ["Eastbourne"], less: [] }, "more", " eastbourne ");
    expect(r.added).toBe(false);
    expect(r.more).toEqual(["Eastbourne"]);
  });

  test("adding to More of this moves it out of Less of this", () => {
    const r = addToList({ more: ["pier"], less: ["Hastings", "brighton"] }, "more", "hastings");
    expect(r.more).toEqual(["pier", "hastings"]);
    expect(r.less).toEqual(["brighton"]);
    expect(r.movedFrom).toBe("less");
  });

  test("adding to Less of this moves it out of More of this", () => {
    const r = addToList({ more: ["Football"], less: [] }, "less", "football");
    expect(r.more).toEqual([]);
    expect(r.less).toEqual(["football"]);
    expect(r.movedFrom).toBe("more");
  });

  test("removing a term removes every spelling of it", () => {
    expect(removeTerm(["Pier", "pier ", "beach"], "PIER")).toEqual(["beach"]);
    expect(dedupeTerms(["Pier", "pier", "beach"])).toEqual(["Pier", "beach"]);
  });

  test("lists over 12 terms show the first 10 and say how many are hidden", () => {
    const list = Array.from({ length: 13 }, (_, i) => `term ${i + 1}`);
    expect(visibleTerms(list.slice(0, 12)).collapsible).toBe(false);
    const v = visibleTerms(list);
    expect(v.shown.length).toBe(10);
    expect(v.hidden).toBe(3);
    expect(visibleTerms(list, { showAll: true }).shown.length).toBe(13);
    expect(visibleTerms(list, { query: "term 1" }).shown).toEqual(["term 1", "term 10", "term 11", "term 12", "term 13"]);
  });

  test("suggestions skip dismissed terms and terms already in either list", () => {
    const s = [{ value: "Bandstand" }, { value: "meads" }, { value: "hastings" }, { value: "pier" }];
    expect(freshSuggestions(s, { more: ["Meads"], less: ["Hastings"] }, { pier: true }).map((x) => x.value)).toEqual(["Bandstand"]);
  });
});
