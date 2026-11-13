// @ts-nocheck -- run with: bun test ./src/lib/feedSetup.test.ts
import { describe, expect, test } from "bun:test";
import { slugify, nameCandidate, addTerm, draftFromSuggestion, topicInsertFromDraft, automationFromDraft } from "./feedSetup";
import { FEATURES } from "./featureFlags";

const pokemon = {
  name: "Pokémon Pulse", topic_type: "keyword", region: null, description: "Pokémon news.",
  keywords: ["pokémon"], negative_keywords: ["pokemon go plus"], colour: "#E3350D",
  illustration_style: "illustrated_icon", welcome: "Pokémon news, every day.", brand_or_fandom: true, family_safe: true,
};
const eastbourne = {
  ...pokemon, name: "Eastbourne Today", topic_type: "regional", region: "Eastbourne",
  illustration_style: "editorial_illustrative", brand_or_fandom: false, family_safe: false,
};

describe("feed setup", () => {
  test("accented names give plain addresses", () => {
    expect(slugify("Pokémon Pulse")).toBe("pokemon-pulse");
  });

  test("taken names get a number", () => {
    expect(nameCandidate("Pokémon Pulse", 1)).toBe("Pokémon Pulse");
    expect(nameCandidate("Pokémon Pulse", 3)).toBe("Pokémon Pulse 3");
  });

  test("terms are added once", () => {
    expect(addTerm(["pikachu"], " Pikachu ")).toEqual(["pikachu"]);
    expect(addTerm(["pikachu"], "Eevee")).toEqual(["pikachu", "eevee"]);
  });

  test("new feeds start on Autopilot", () => {
    expect(draftFromSuggestion(pokemon).autopilot).toBe(true);
    expect(automationFromDraft(draftFromSuggestion(pokemon)).automation_mode).toBe("holiday");
    expect(topicInsertFromDraft(draftFromSuggestion(pokemon), "pokemon-pulse", "u").auto_simplify_enabled).toBe(true);
  });

  test("turning Autopilot off keeps gathering but holds stories for review", () => {
    const d = { ...draftFromSuggestion(eastbourne), autopilot: false };
    expect(automationFromDraft(d).automation_mode).toBe("auto_gather");
    expect(topicInsertFromDraft(d, "e", "u").auto_simplify_enabled).toBe(false);
  });

  test("a fandom feed keeps source photos and never auto-draws", () => {
    const d = draftFromSuggestion(pokemon);
    expect(d.pictures).toBe("source");
    expect(topicInsertFromDraft(d, "p", "u").brand_safe_pictures).toBe(true);
    expect(automationFromDraft(d).auto_illustrate_enabled).toBe(false);
  });

  test("Family-safe is parked: new feeds never get it switched on while the feature is off", () => {
    if (FEATURES.familySafe) {
      expect(topicInsertFromDraft(draftFromSuggestion(pokemon), "p", "u").family_safe).toBe(true);
      expect(topicInsertFromDraft(draftFromSuggestion(eastbourne), "e", "u").family_safe).toBe(false);
      return;
    }
    expect(draftFromSuggestion(pokemon).family_safe).toBe(false);
    expect("family_safe" in topicInsertFromDraft(draftFromSuggestion(pokemon), "p", "u")).toBe(false);
    expect("family_safe" in topicInsertFromDraft(draftFromSuggestion(eastbourne), "e", "u")).toBe(false);
  });

  test("the welcome line becomes the feed's subheader", () => {
    expect(topicInsertFromDraft(draftFromSuggestion(eastbourne), "e", "u").branding_config).toEqual({ subheader: "Pokémon news, every day." });
  });
});
