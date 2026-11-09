// @ts-nocheck -- run with: bun test ./src/lib/lastSlide.test.ts
import { describe, expect, test } from 'bun:test';
import { stripReaderPrompts, cleanAuthor, buildReporterByline, prepareStorySlides } from './lastSlide';
import { pickSharedSize } from './slideTextFit';

const strip = (t: string) => stripReaderPrompts(t).text;

describe('reader prompts removed from real Eastbourne last slides', () => {
  test('1 walking route: question + share removed', () => {
    expect(strip('Once finished, the route will provide continuous off-road access from Chichester to the chalk ridge. Have you walked the new stretch yet? Share your thoughts with other walkers.'))
      .toBe('Once finished, the route will provide continuous off-road access from Chichester to the chalk ridge.');
  });
  test('2 poppies: read more removed', () => {
    expect(strip('Final donation totals will be confirmed once collection boxes for paper poppies are tallied. Read more on community efforts across East Sussex or share this story with neighbours.'))
      .toBe('Final donation totals will be confirmed once collection boxes for paper poppies are tallied.');
  });
  test('3 pier kiosk: discuss removed', () => {
    expect(strip('Whether the kiosk becomes a coffee hatch or snack bar rests with the winning bidder. Discuss with others what kind of takeaway should open next to the pier.'))
      .toBe('Whether the kiosk becomes a coffee hatch or snack bar rests with the winning bidder.');
  });
  test('4 police appeal kept', () => {
    const t = 'Callers must quote serial 1467 of 04/11 when speaking to officers. Share this report with local contacts to assist the search.';
    expect(strip(t)).toBe(t);
  });
  test('5 missing-person appeal kept', () => {
    const t = 'Share this appeal with friends and neighbours across Brighton and Sussex to help trace Arthur. Anyone with fresh sightings is urged to contact emergency services immediately.';
    expect(strip(t)).toBe(t);
  });
  test('6 101 appeal kept', () => {
    const t = 'Reports can be submitted online or by calling 101, quoting serial 466 of 05/11. Share this report to help reach local drivers.';
    expect(strip(t)).toBe(t);
  });
  test('7 theatre: explore the removed', () => {
    expect(strip('Box office bookings are now open for the production ahead of opening night. Explore the schedule with friends or discuss your favourite stage mysteries before the curtain rises in Eastbourne.'))
      .toBe('Box office bookings are now open for the production ahead of opening night.');
  });
  test('8 nature reserve: explore further removed', () => {
    expect(strip('Today the reserve forms part of the King’s Series of National Nature Reserves declared earlier this year. Explore further to see how traditional grazing methods are restoring sensitive Sussex landscapes.'))
      .toBe('Today the reserve forms part of the King’s Series of National Nature Reserves declared earlier this year.');
  });
  test('9 and 10 no prompt: unchanged', () => {
    const a = 'League fixtures brought similar success, with Eastbourne defeating Wealden 116-58 in the Men’s County League. The comprehensive margin leaves Eastbourne 3.5 points clear of Falaise at the top of the East Division.';
    const b = "Former military personnel marched along South Street for the final parade, bringing the town's annual act of remembrance to a close.";
    expect(strip(a)).toBe(a);
    expect(strip(b)).toBe(b);
  });
  test('woven-in prompt is left alone', () => {
    const t = 'The clampdown also covers modified e-bikes with boosted motors. Check national vehicle regulations carefully before buying transport gifts this winter, and discuss the rules with friends.';
    expect(strip(t)).toBe(t);
  });
  test('sentence with a web address or number is kept', () => {
    const t = 'Tickets go on sale on Friday. Share this with friends at eastbourne.gov.uk.';
    expect(strip(t)).toBe(t);
  });
  test('web addresses are not split apart', () => {
    expect(strip('Tickets from £27 at eastbournetheatres.co.uk. Share this with friends who need a prescription of laughter!'))
      .toBe('Tickets from £27 at eastbournetheatres.co.uk.');
  });
  test('new openers: Share with / Discuss this / Read more / Explore more', () => {
    expect(strip('The fair runs until Sunday. Share with friends who love vintage fairs.')).toBe('The fair runs until Sunday.');
    expect(strip('Councillors meet again next month. Discuss this developing story with others.')).toBe('Councillors meet again next month.');
    expect(strip('The brewery opens in spring. Read more and share with other beer fans.')).toBe('The brewery opens in spring.');
    expect(strip('The garden reopens in May. Explore more of the town’s parks.')).toBe('The garden reopens in May.');
  });
  test('"read more" inside a sentence is not a prompt', () => {
    const t = 'The club opens on Saturday. Members say they want to read more local history.';
    expect(strip(t)).toBe(t);
  });
  test('only the last two sentences are candidates', () => {
    const t = 'Share with care, the charity says. The scheme opened last week. Volunteers are still needed.';
    expect(strip(t)).toBe(t);
  });
});

describe('"Source:" credit sentences', () => {
  test('removed anywhere on the last slide', () => {
    expect(strip('Source: Mike MacKenzie / Eastbourne. The road reopens on Monday morning.')).toBe('The road reopens on Monday morning.');
    expect(strip('Catch the final performances through Friday. Source: Eastbourne review by Peter Lindsey')).toBe('Catch the final performances through Friday.');
    expect(strip('Book now. Sources: SussexWorld, BBC. Doors open at seven.')).toBe('Book now. Doors open at seven.');
  });
  test('"source" inside an ordinary sentence is kept', () => {
    const t = 'The spring is the main water source for the village. Engineers will test it next week.';
    expect(strip(t)).toBe(t);
  });
  test('removed even in an appeal, while the appeal share ask stays', () => {
    expect(strip('Help locate Peter. Discuss this appeal with others to spread awareness. Source: Sussex Police appeal via SussexWorld.'))
      .toBe('Help locate Peter. Discuss this appeal with others to spread awareness.');
  });
});

describe('empty closing slides are dropped', () => {
  const s = (n: number, content: string) => ({ slide_number: n, content, links: [] });
  test('last slide with only prompts and a credit is dropped; previous becomes last', () => {
    const out = prepareStorySlides([
      s(1, 'Headline'),
      s(2, 'The pier kiosk is up for auction.'),
      s(3, 'Share with friends to keep community informed. Source: Peter Lindsey, Eastbourne publication.'),
    ]);
    expect(out.dropped).toBe(1);
    expect(out.slides.map((x) => x.slide_number)).toEqual([1, 2]);
    expect(out.slides[1].content).toBe('The pier kiosk is up for auction.');
  });
  test('the new last slide is cleaned too', () => {
    const out = prepareStorySlides([
      s(1, 'Headline'),
      s(2, 'Bidding closes on 18 November. Share this story with neighbours.'),
      s(3, 'Source: Eastbourne News.'),
    ]);
    expect(out.slides.length).toBe(2);
    expect(out.slides[1].content).toBe('Bidding closes on 18 November.');
  });
  test('a story never ends on an empty slide and the headline is never dropped', () => {
    const out = prepareStorySlides([s(1, 'Headline'), s(2, 'Share this with friends.'), s(3, 'Source: X.')]);
    expect(out.slides.map((x) => x.slide_number)).toEqual([1]);
    for (const story of [out.slides]) {
      const last = story[story.length - 1];
      expect(last.content.trim().length).toBeGreaterThan(0);
    }
  });
  test('cleaned last slide drops stale link offsets; untouched slide keeps them', () => {
    const link = { start: 0, end: 3, url: 'https://x.test', text: 'The' };
    const changed = prepareStorySlides([s(1, 'H'), { slide_number: 2, content: 'The pier opens. Share with friends.', links: [link] }]);
    expect(changed.slides[1].links).toEqual([]);
    const same = prepareStorySlides([s(1, 'H'), { slide_number: 2, content: 'The pier opens.', links: [link] }]);
    expect(same.slides[1].links).toEqual([link]);
  });
});

describe('byline', () => {
  test('drops leading By', () => expect(buildReporterByline('By Amna Zaman')).toBe('By Amna Zaman'));
  test('username shows nothing', () => expect(cleanAuthor('jefftravis')).toBeNull());
  test('empty shows nothing', () => expect(buildReporterByline(null)).toBeNull());
  test('two reporters kept', () => expect(buildReporterByline('Ivana Domozetska and Sam Morton')).toBe('By Ivana Domozetska and Sam Morton'));
});

describe('shared slide size', () => {
  // fake measure: a block "fits" when length * px <= 4000
  const fits = (b: string, px: number) => b.length * px <= 4000;
  test('starts at 40 for short text', () => expect(pickSharedSize(['x'.repeat(50)], fits, 40).size).toBe(40));
  test('set by the longest slide', () => expect(pickSharedSize(['x'.repeat(50), 'x'.repeat(150)], fits, 40).size).toBe(26));
  test('never below 20; overflow reported', () => {
    const r = pickSharedSize(['x'.repeat(50), 'x'.repeat(300)], fits, 40);
    expect(r.size).toBe(20);
    expect(r.overflow).toEqual([1]);
  });
});
