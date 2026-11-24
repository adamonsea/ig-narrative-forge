import { describe, it, expect } from "vitest";
import {
  assembleCaption, captionFields, normaliseTime, relativeBefore, ticketNote, cleanHashtags, mergeUnlocked,
  priceText, dayPair, mapGenre, deriveFlags, synopsisFlags, factsHash,
} from "@/lib/editorial/captionAssembler";

const INSTAGRAM = ["{heading}", "{subheading}", "", "{day} {date}[ · {time}]", "{venue}", "[{price} · ]{tickets}", "{extra_facts}", "", "{synopsis.pt-PT}", "", "{synopsis.en}", "", "{hashtags}"];
const LISBON = {
  languages: ["pt-PT", "en"], fixed_hashtags: ["#lisboa", "#oquefazeremlisboa", "#whatsonlisbon"], event_hashtag_max: 4,
  labels: { free: "Grátis / Free", tickets: "Bilhetes / Tickets: link na bio / link in bio" },
};

const EX1 = `Solistas da Orquestra Gulbenkian
Gulbenkian Orchestra Soloists

Seg/Mon 23.11 · 20:00
Fundação Calouste Gulbenkian
Grátis / Free · Bilhetes / Tickets: link na bio / link in bio

Os músicos da Orquestra Gulbenkian, de enorme qualidade técnica e artística, sobem ao palco em formação de câmara num dos concertos gratuitos da temporada.

The Gulbenkian Orchestra's musicians, players of great technical and artistic quality, step out in chamber formation for one of the season's free concerts.

#lisboa #oquefazeremlisboa #whatsonlisbon #musicaclassica #musicadecamara #gulbenkian`;

const EX2_PT = "No âmbito do Olhares do Mediterrâneo – Women's Film Festival, que decorre de hoje até 2 de dezembro, a Cinemateca apresenta Family Therapy (Odrešitev za začetnike), da realizadora eslovena Sonja Prosenc. Uma releitura tragicómica de Teorema, de Pasolini, em que um jovem desconhecido entra numa família da nova burguesia, aparentemente perfeita, e expõe as fissuras por detrás da fachada.";
const EX2_EN = "As part of the Olhares do Mediterrâneo – Women's Film Festival, running from today until 2 December, the Cinemateca presents Family Therapy by Slovenian director Sonja Prosenc. A darkly comic reworking of Pasolini's Teorema, it follows a young stranger who enters a seemingly perfect, newly wealthy family and exposes the cracks behind the façade.";
const EX2 = `Olhares do Mediterrâneo – Women's Film Festival
Family Therapy

Seg/Mon 23.11 · 18:30
Cinemateca Portuguesa, Sala SFR
Bilhetes / Tickets: link na bio / link in bio
Estreia nacional · Sessão com Q&A / Portuguese premiere · Q&A session

${EX2_PT}

${EX2_EN}

#lisboa #oquefazeremlisboa #whatsonlisbon #cinema #cinemateca #olharesdomediterraneo`;

describe("golden: Mike's worked examples", () => {
  it("example 1 — Gulbenkian Orchestra Soloists, free, English subtitle", () => {
    const f = captionFields({
      title: "Solistas da Orquestra Gulbenkian", subtitle: "Gulbenkian Orchestra Soloists",
      start_date: "2026-11-23", start_time: "20h", location: "Fundação Calouste Gulbenkian", is_free: true,
      event_hashtags: ["música clássica", "música de câmara", "Gulbenkian"],
      synopsis: {
        "pt-PT": "Os músicos da Orquestra Gulbenkian, de enorme qualidade técnica e artística, sobem ao palco em formação de câmara num dos concertos gratuitos da temporada.",
        en: "The Gulbenkian Orchestra's musicians, players of great technical and artistic quality, step out in chamber formation for one of the season's free concerts.",
      },
    }, LISBON, "EUR");
    expect(assembleCaption(INSTAGRAM, f)).toBe(EX1);
  });

  it("example 1 — ticket_note converts '2 hours before' a 20:00 start", () => {
    expect(ticketNote({ collection_offset: "2 hours before", max_per_person: 2, subject_to_capacity: true }, "20h"))
      .toBe("collection from 18:00, max. 2 per person, subject to capacity");
  });

  it("example 2 — festival heading, film subheading, no price line", () => {
    const f = captionFields({
      title: "Family Therapy", festival: "Olhares do Mediterrâneo – Women's Film Festival",
      start_date: "2026-11-23", end_date: null, start_time: "18:30:00", location: "Cinemateca Portuguesa, Sala SFR",
      price: null, is_free: null, extra_facts: "Estreia nacional · Sessão com Q&A / Portuguese premiere · Q&A session",
      event_hashtags: ["cinema", "cinemateca", "olharesdomediterraneo"], synopsis: { "pt-PT": EX2_PT, en: EX2_EN },
    }, LISBON, "EUR");
    expect(assembleCaption(INSTAGRAM, f)).toBe(EX2);
  });

  it("subtitle equal to the heading is left out", () => {
    const f = captionFields({ title: "Fado", subtitle: "fado", start_date: "2026-11-23" }, LISBON);
    expect(f["subheading"]).toBe("");
  });
});

describe("fact conversions", () => {
  it("20h → 20:00", () => expect(normaliseTime("20h")).toBe("20:00"));
  it("8pm → 20:00", () => expect(normaliseTime("8pm")).toBe("20:00"));
  it("unclear time → null", () => expect(normaliseTime("evening")).toBeNull());
  it("2 hours before 20:00 → 18:00", () => expect(relativeBefore("2 hours before", "20:00")).toBe("18:00"));
  it("€ before the number, ranges with en dash", () => expect(priceText("7-12", false, "EUR", "Free")).toBe("€7–12"));
  it("bare amount with no currency is not guessed", () => expect(priceText("12", false, null, "Free")).toBeNull());
  it("Eastbourne-style English-only day", () => expect(dayPair("2026-11-23", ["en"])).toBe("Mon"));
});

describe("hashtags, genre, flags", () => {
  it("lower case, no accents, max 4", () => expect(cleanHashtags(["Música Clássica", "a", "b", "c", "d"], 4)).toEqual(["#musicaclassica", "#a", "#b", "#c"]));
  it("Agenda LX 'literatura' maps to Conversas", () => expect(mapGenre([{ name: "Música", from: ["música"] }, { name: "Conversas", from: ["literatura", "ciências"] }], ["Literatura"])).toBe("Conversas"));
  it("English-friendly only when the source says so", () => {
    const rules = { "Em inglês / English-friendly": "english" as const, "Grátis / Free": "free" as const };
    expect(deriveFlags(rules, { is_free: true, sourceText: "A concert" })).toEqual(["Grátis / Free"]);
    expect(deriveFlags(rules, { sourceText: "Performed in English" })).toEqual(["Em inglês / English-friendly"]);
  });
});

describe("synopsis checks", () => {
  it("flags exclamation, promo and pt-BR", () => {
    const f = synopsisFlags("Você não pode perder este concerto imperdível! É ótimo.", "pt-PT", { sourceText: "", eventDate: "2026-11-23", postDate: "2026-11-23" });
    expect(f).toEqual(expect.arrayContaining(["Exclamation mark (PT)", "Promo wording (PT)", "Possible Brazilian Portuguese"]));
  });
  it("flags 'today' when not posting that day", () => {
    expect(synopsisFlags(EX2_EN, "en", { sourceText: "", eventDate: "2026-11-23", postDate: "2026-11-20" })).toContain('"Today" used but not posting that day (EN)');
  });
  it("flags copied source sentences", () => {
    expect(synopsisFlags(EX2_EN, "en", { sourceText: EX2_EN, eventDate: "2026-11-23", postDate: "2026-11-23" })).toContain("Copies source wording (EN)");
  });
});

describe("edit locks and source hash", () => {
  it("hand-edited fields survive re-gather", () => expect(mergeUnlocked({ price: "10€", venue: "A" }, { price: "12€", venue: "B" }, new Set(["price"]))).toEqual({ price: "10€", venue: "B" }));
  it("hash changes only when facts change", () => {
    const a = { title: "X", start_date: "2026-11-23", price: "€5" };
    expect(factsHash(a)).toBe(factsHash({ ...a }));
    expect(factsHash(a)).not.toBe(factsHash({ ...a, price: "€6" }));
  });
});
