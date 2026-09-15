// House style reference pictures.
//
// These are existing covers that define the look we want new pictures to match.
// They are attached to OpenAI image requests through the image-edits route as
// STYLE guidance only — never as content to reproduce.
//
// Only newer models (GPT Image 2 and later) receive references; GPT Image 1.5
// keeps its plain generation path unchanged.

export const HOUSE_STYLE_REFERENCE_URLS: string[] = [
  'https://fpoywkjgdapgjtdeooak.supabase.co/storage/v1/object/public/visuals/story-4ba87434-8e79-44d2-a4fc-d680e9929705-1789491592454.webp',
  'https://fpoywkjgdapgjtdeooak.supabase.co/storage/v1/object/public/visuals/story-badac434-60df-4867-bbf7-d8f7aca94053-1789491725513.webp',
];

export const STYLE_REFERENCE_NOTE =
  '\n\nSTYLE REFERENCE: The attached image(s) are examples of the required house style only. ' +
  'Match their artistic treatment, palette handling, level of abstraction, lighting, composition ' +
  'balance and finish as closely as possible. Do NOT copy their subject matter, characters, ' +
  'text or scene — illustrate the new subject described above in that same style. ' +
  'Match the AMOUNT of detail as strictly as the look: the same small number of distinct flat ' +
  'shapes, the same flatness, the same ink count, the same level of abstraction in faces and ' +
  'backgrounds. If unsure, draw LESS than the reference — under-detailing is preferred to ' +
  'over-detailing.';

export interface StyleReferenceBlob {
  blob: Blob;
  name: string;
}

/**
 * Downloads the house style references. Fail-open: any reference that cannot be
 * fetched is skipped, and an empty result means the caller falls back to the
 * ordinary generation path.
 */
export async function loadStyleReferences(
  urls: string[] = HOUSE_STYLE_REFERENCE_URLS,
): Promise<StyleReferenceBlob[]> {
  const refs: StyleReferenceBlob[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      const type = res.headers.get('content-type') || 'image/png';
      const ext = type.includes('webp') ? 'webp' : type.includes('jpeg') ? 'jpg' : 'png';
      refs.push({
        blob: new Blob([buf], { type }),
        name: `reference-${refs.length + 1}.${ext}`,
      });
    } catch (error) {
      console.warn(`Could not load style reference ${url}: ${error}`);
    }
  }
  return refs;
}

/**
 * Note appended when photographs of a real place are attached alongside the
 * house style references. The style comes from the style covers; the building's
 * shape comes from the photographs.
 */
export const SUBJECT_REFERENCE_NOTE =
  '\n\nSUBJECT REFERENCE: The final attached image(s) are PHOTOGRAPHS of the real place named above. ' +
  'They define the ARCHITECTURE ONLY: overall massing, proportions, number of storeys, roofline, ' +
  'window pattern, materials and setting. Reproduce those shapes faithfully so the place is ' +
  'recognisable. Do NOT copy the photographs literally, and do NOT take their photographic look, ' +
  'colour, lighting or level of detail — the finish must come entirely from the house style ' +
  'reference(s), reduced to the same small number of flat shapes.';

/**
 * Downloads arbitrary reference photographs (e.g. a place's saved photos).
 * Fail-open: anything that cannot be fetched is skipped.
 */
export async function loadReferenceImagesFromUrls(
  urls: string[],
  prefix = 'subject',
): Promise<StyleReferenceBlob[]> {
  const refs: StyleReferenceBlob[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      const type = res.headers.get('content-type') || 'image/png';
      const ext = type.includes('webp') ? 'webp' : type.includes('jpeg') ? 'jpg' : 'png';
      refs.push({
        blob: new Blob([buf], { type }),
        name: `${prefix}-${refs.length + 1}.${ext}`,
      });
    } catch (error) {
      console.warn(`Could not load reference image ${url}: ${error}`);
    }
  }
  return refs;
}
