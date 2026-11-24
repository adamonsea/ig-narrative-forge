import { describe, it, expect } from "vitest";
import { textToFlags, textToGenres, textToHashtags } from "@/lib/editorial/profileText";

describe("profile text", () => {
  it("genre lines with source mappings", () => expect(textToGenres("Conversas: literatura, Ciências")).toEqual([{ name: "Conversas", from: ["literatura", "ciências"] }]));
  it("flags keep rules; unknown rules are manual", () => expect(textToFlags("Grátis / Free = free\nAcessível = magic")).toEqual({ flags: ["Grátis / Free", "Acessível"], flag_rules: { "Grátis / Free": "free" } }));
  it("hashtags get # and lower case", () => expect(textToHashtags("Lisboa #WhatsOnLisbon")).toEqual(["#lisboa", "#whatsonlisbon"]));
});
