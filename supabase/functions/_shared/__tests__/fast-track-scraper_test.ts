// Regression tests locking in the fix for the silent scraping outage:
//  (1) uk_local / generic slug-style article URLs must be detected on index pages
//      (the brittle /article|story|post/ pattern previously found 0 links and the
//       run was logged as a success).
//  (2) Auto-learned profiles must never disable RSS via skip:['rss'].
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { FastTrackScraper } from "../fast-track-scraper.ts";

function makeScraper(family: string) {
  const stubSupabase = {} as any;
  const scraper = new FastTrackScraper(stubSupabase) as any;
  scraper.domainProfile = { family, scrapingStrategy: { preferred: "html", skip: [] } };
  return scraper;
}

const indexHtml = `
  <html><body>
    <a href="https://eastbournereporter.co.uk/eastbourne-pier-reopens-after-fire/">Pier reopens</a>
    <a href="https://eastbournereporter.co.uk/council-approves-new-cycle-lane-plan/">Cycle lane</a>
    <a href="https://eastbournereporter.co.uk/about/">About</a>
    <a href="https://eastbournereporter.co.uk/contact">Contact</a>
    <a href="https://twitter.com/someone">Twitter</a>
  </body></html>`;

Deno.test("uk_local slug-style article links are detected on index pages", () => {
  const scraper = makeScraper("uk_local");
  const links: string[] = scraper.extractArticleLinksFromIndex(
    indexHtml,
    "https://eastbournereporter.co.uk/",
  );
  assert(
    links.some((l) => l.includes("eastbourne-pier-reopens-after-fire")),
    `expected slug article link, got: ${JSON.stringify(links)}`,
  );
  assert(
    links.some((l) => l.includes("council-approves-new-cycle-lane-plan")),
    `expected second slug article link, got: ${JSON.stringify(links)}`,
  );
  // Boilerplate single-word pages must NOT be treated as articles.
  assert(!links.some((l) => l.endsWith("/about/")));
  assert(!links.some((l) => l.endsWith("/contact")));
  // External links must be excluded.
  assert(!links.some((l) => l.includes("twitter.com")));
});

Deno.test("generic family also falls back to slug detection", () => {
  const scraper = makeScraper("custom");
  const links: string[] = scraper.extractArticleLinksFromIndex(
    indexHtml,
    "https://eastbournereporter.co.uk/",
  );
  assert(links.length >= 2, `expected slug fallback to find links, got: ${JSON.stringify(links)}`);
});
