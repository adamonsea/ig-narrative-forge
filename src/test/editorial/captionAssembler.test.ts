import { describe, it, expect } from "vitest";
import { assembleCaption, normaliseTime, relativeBefore, cleanHashtags, mergeUnlocked } from "@/lib/editorial/captionAssembler";

describe("caption assembler", () => {
  it("omits a line whose field is empty", () => {
    expect(assembleCaption(["{title}", "{price}", "{venue}"], { title: "A", price: "", venue: "V" })).toBe("A\nV");
  });
  it("keeps template line order", () => {
    expect(assembleCaption(["{festival}", "{title}"], { festival: "F", title: "T" })).toBe("F\nT");
  });
});
describe("fact conversions", () => {
  it("20h → 20:00", () => expect(normaliseTime("20h")).toBe("20:00"));
  it("8pm → 20:00", () => expect(normaliseTime("8pm")).toBe("20:00"));
  it("unclear time → null", () => expect(normaliseTime("evening")).toBeNull());
  it("2 hours before 20:00 → 18:00", () => expect(relativeBefore("2 hours before", "20:00")).toBe("18:00"));
});
describe("hashtags", () => {
  it("lower case, no accents, max", () => expect(cleanHashtags(["Música Clássica", "Gulbenkian", "x", "y", "z"], 4)).toEqual(["#musicaclassica", "#gulbenkian", "#x", "#y"]));
});
describe("edit locks", () => {
  it("hand-edited fields survive re-gather", () => expect(mergeUnlocked({ price: "10€", venue: "A" }, { price: "12€", venue: "B" }, new Set(["price"]))).toEqual({ price: "10€", venue: "B" }));
});
