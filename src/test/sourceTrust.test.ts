import { describe, expect, it } from "vitest";
import { trustVerdict } from "@/lib/sourceTrust";

const poke = ["Pokémon", "Pokemon TCG"];
describe("trust everything guardrail", () => {
  it("allows a source about the subject", () => {
    expect(trustVerdict({ url: "https://www.pokejungle.net/feed", name: "PokéJungle" }, poke)).toBe("allowed");
  });
  it("blocks a broad site like Polygon", () => {
    expect(trustVerdict({ url: "https://www.polygon.com/rss", name: "Polygon" }, poke)).toBe("broad");
  });
  it("blocks an off-subject site on a subject feed", () => {
    expect(trustVerdict({ url: "https://example-cars.com", name: "Car News" }, poke)).toBe("broad");
  });
  it("allows local outlets on regional feeds but not broad nationals", () => {
    expect(trustVerdict({ url: "https://sussexexpress.co.uk" }, ["Eastbourne"], true)).toBe("allowed");
    expect(trustVerdict({ url: "https://www.bbc.co.uk/news" }, ["Eastbourne"], true)).toBe("broad");
  });
});
