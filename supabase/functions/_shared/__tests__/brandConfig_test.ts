import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DEFAULT_VAPID_SUBJECT, SITE_URL, senderFor } from "../brandConfig.ts";
import { KNOWN_PUBLICATIONS, SOURCE_ALIASES, WIDGET_SOURCE_NAMES } from "../publisherNames.ts";

Deno.test("emails keep the feed name over the same sending address", () => {
  assertEquals(senderFor("Whats on Lisbon"), "Whats on Lisbon <noreply@curatr.pro>");
});
Deno.test("links and push contact keep the same address", () => {
  assertEquals(SITE_URL, "https://curatr.pro");
  assertEquals(DEFAULT_VAPID_SUBJECT, "mailto:notifications@curatr.pro");
});
Deno.test("every existing publisher name is kept", () => {
  assertEquals(Object.keys(KNOWN_PUBLICATIONS).length, 23);
  assertEquals(KNOWN_PUBLICATIONS["eastbournereporter.co.uk"], "Eastbourne Reporter");
  assertEquals(KNOWN_PUBLICATIONS["eastbourneunltd.co.uk"], "Eastbourne Chamber");
  assertEquals(SOURCE_ALIASES["eastbourne.news"], "eastbournereporter.co.uk");
  assertEquals(WIDGET_SOURCE_NAMES["eastbourne.news"], "Eastbourne News");
});
