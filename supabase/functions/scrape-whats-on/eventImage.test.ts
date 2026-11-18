import { assert, assertEquals } from 'jsr:@std/assert@1';
import { imageAddress, imageSize, judgeImage, photoExpired, photoPath, placeholderImages } from './eventImage.ts';

Deno.test('image addresses: relative made absolute, http upgraded, svg/gif/data refused', () => {
  const base = 'https://brightoncentre.co.uk/whats-on/';
  assertEquals(imageAddress('/media/a.jpg?width=480', base), 'https://brightoncentre.co.uk/media/a.jpg?width=480');
  assertEquals(imageAddress('http://x.pt/a.jpg', base), 'https://x.pt/a.jpg');
  assertEquals(imageAddress({ url: 'https://x.pt/b.png' }, base), 'https://x.pt/b.png');
  assertEquals(imageAddress(['https://x.pt/c.webp'], base), 'https://x.pt/c.webp');
  assertEquals(imageAddress('https://x.pt/logo.svg', base), null);
  assertEquals(imageAddress('https://x.pt/spin.gif', base), null);
  assertEquals(imageAddress('data:image/png;base64,AAA', base), null);
  assertEquals(imageAddress('', base), null);
});

Deno.test('the same picture on more than a quarter of events is a placeholder', () => {
  const logo = 'https://x/logo.jpg';
  const urls = [logo, logo, logo, 'https://x/1.jpg', 'https://x/2.jpg', 'https://x/3.jpg', 'https://x/4.jpg', 'https://x/5.jpg', null, null];
  assertEquals([...placeholderImages(urls)], [logo]);
  // Two repeats (a show on two nights) are not a placeholder
  assertEquals(placeholderImages(['https://x/a.jpg', 'https://x/a.jpg', 'https://x/b.jpg']).size, 0);
});

Deno.test('photos: jpeg/png/webp, under 5MB, at least 480px wide, not portrait', () => {
  assert(judgeImage({ type: 'image/jpeg', bytes: 200_000, width: 1200, height: 800 }).ok);
  assert(judgeImage({ type: 'image/png', bytes: 200_000, width: 480, height: 480 }).ok);
  assertEquals(judgeImage({ type: 'image/gif', bytes: 1000, width: 900, height: 600 }), { ok: false, reason: 'type' });
  assertEquals(judgeImage({ type: 'image/jpeg', bytes: 6 * 1024 * 1024, width: 900, height: 600 }), { ok: false, reason: 'size' });
  assertEquals(judgeImage({ type: 'image/jpeg', bytes: 1000, width: 300, height: 200 }), { ok: false, reason: 'small' });
  assertEquals(judgeImage({ type: 'image/webp', bytes: 1000, width: 800, height: 1200 }), { ok: false, reason: 'portrait' });
  assertEquals(judgeImage({ type: 'image/jpeg', bytes: 1000, width: null, height: null }), { ok: false, reason: 'unreadable' });
});

Deno.test('a photo is deleted the day after its event ends', () => {
  assertEquals(photoExpired({ start_date: '2026-11-18' }, '2026-11-18'), false);
  assertEquals(photoExpired({ start_date: '2026-11-17' }, '2026-11-18'), true);
  assertEquals(photoExpired({ start_date: '2026-11-10', end_date: '2026-11-20' }, '2026-11-18'), false);
  assertEquals(photoExpired({ start_date: '2026-11-10', end_date: '2026-11-17' }, '2026-11-18'), true);
});

Deno.test('photo sizes are read from file headers', () => {
  const png = new Uint8Array(32);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(png.buffer).setUint32(16, 1024);
  new DataView(png.buffer).setUint32(20, 576);
  assertEquals(imageSize(png), { width: 1024, height: 576 });
  // JPEG: SOI, an APP0 segment, then SOF0 with height 600, width 800
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03, 0, 0, 0, 0, 0, 0]);
  assertEquals(imageSize(jpg), { width: 800, height: 600 });
  assertEquals(imageSize(new Uint8Array(30)), null);
});

Deno.test('photos live under the feed folder so storage rules match', () => {
  assertEquals(photoPath('t1', 'e1'), 't1/events/e1.webp');
});
