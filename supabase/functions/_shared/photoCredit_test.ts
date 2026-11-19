import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cleanCredit, findPhotoCredit, creditFromArcPromo } from "./photoCredit.ts";

Deno.test("JSON-LD ImageObject creditText matching the lead image", () => {
  const html = `<script type="application/ld+json">{"@type":"NewsArticle","image":{"@type":"ImageObject","url":"https://x.com/img/pier-fire.jpg","creditText":"Photo: Jane Smith"}}</script>`;
  assertEquals(findPhotoCredit(html, "https://x.com/img/pier-fire.jpg"), "Jane Smith");
});

Deno.test("copyrightHolder object name", () => {
  const html = `<script type="application/ld+json">{"@type":"ImageObject","url":"https://x.com/a/beach.jpg","copyrightHolder":{"@type":"Organization","name":"PA Images"}}</script>`;
  assertEquals(findPhotoCredit(html, "https://x.com/a/beach.jpg"), "PA Images");
});

Deno.test("figcaption 'Picture:' next to the matching image", () => {
  const html = `<figure><img src="/wp-content/uploads/town-hall-1024x576.jpg"><figcaption>The town hall. Picture: Eastbourne Borough Council</figcaption></figure>`;
  assertEquals(findPhotoCredit(html, "https://site.com/wp-content/uploads/town-hall.jpg"), "Eastbourne Borough Council");
});

Deno.test("credit element inside figure", () => {
  const html = `<figure><img src="https://s.com/p/lifeboat.webp"><span class="image-credit">© RNLI</span></figure>`;
  assertEquals(findPhotoCredit(html, "https://s.com/p/lifeboat.webp"), "RNLI");
});

Deno.test("no credit on the page gives undefined", () => {
  const html = `<figure><img src="https://s.com/p/lifeboat.webp"><figcaption>Crowds gather on the seafront</figcaption></figure>`;
  assertEquals(findPhotoCredit(html, "https://s.com/p/lifeboat.webp"), undefined);
});

Deno.test("cleanCredit rejects urls and overlong text", () => {
  assertEquals(cleanCredit("https://example.com/photo"), undefined);
  assertEquals(cleanCredit("x".repeat(120)), undefined);
  assertEquals(cleanCredit("Credit: John Doe."), "John Doe");
});

Deno.test("Arc promo credits", () => {
  assertEquals(creditFromArcPromo({ credits: { by: [{ name: "Sam Lee" }] } }), "Sam Lee");
});
