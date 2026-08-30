# Fix and simplify manual story upload

## What's actually broken

Audit of the drag & drop panel (`ManualContentStaging`, `extract-content-from-upload`, `temp-uploads` bucket) found four real faults. No manual upload has succeeded since 22 Sep 2025 (last row in the database), which matches when the storage bucket was locked down.

1. **Uploads are rejected by storage security.** The bucket policy only allows writes into a folder named after your user id (`<your-id>/file.png`), but the panel uploads to the bucket root. Every drop fails at the first step with a permissions error.
2. **PDFs were never implemented.** The backend explicitly returns "PDF extraction not yet supported" — despite the drop zone advertising PDFs.
3. **Everything is titled "Manual Upload: filename".** No headline, no author, no publication is extracted, and the source shows as `manual-upload.local`, so uploaded items look broken in Arrivals and carry wrong attribution downstream.
4. **Fragile queue.** Files are tracked in browser localStorage against a 1-hour signed URL; closing the tab, a slow tab, or an expired link silently kills the job with an "upload expired" message.

Plus: the whole thing is hidden behind a small collapsed button, and there is no way to simply paste text or a URL — which is what you actually want most of the time.

## What we'll build

**One "Add story" button** on the topic dashboard opening a single dialog with three tabs:

- **Paste** (default) — paste article text or a headline + body. Instant, no AI extraction round-trip needed.
- **Link** — paste a URL; we fetch and extract it using the existing scraper extraction path.
- **File** — drag & drop images, PDFs, text, Word docs.

All three land in the same place: a preview card showing the detected **headline, author, publication and date**, all editable inline, with one **Add to Arrivals** button. Nothing is written to the database until you confirm, so a bad extraction is fixed in the dialog rather than in the pipeline.

## Fixes behind it

- Upload to `<user-id>/<timestamp>-<name>` so the storage policy is satisfied; surface a plain-English error if it still fails.
- Real PDF support: text-layer extraction first, falling back to page-image OCR for scanned PDFs. Word/`.docx` handled the same way.
- Extraction now returns structured fields (headline, byline, publication, published date, body) rather than a blob, so uploaded stories carry proper attribution instead of `manual-upload.local`.
- Replace the localStorage/signed-URL queue with a straightforward per-file progress state in the dialog; the file is read and processed in one pass while the dialog is open, so nothing can expire mid-flight.
- Retry, per-file error text ("couldn't read this PDF", "no text found in image"), and clean-up of the temp file after success.
- Uploaded items enter Arrivals with `manual_upload` metadata so they're visibly distinct and skip the locality gatekeeper (you chose them deliberately).

## Technical notes

- `src/components/ManualContentStaging.tsx` retired in favour of `src/components/manual/AddStoryDialog.tsx` (tabs) + `PasteTab`, `LinkTab`, `FileTab`, and a shared `ExtractedStoryPreview` editor.
- `supabase/functions/extract-content-from-upload/index.ts` reworked: accepts `{ mode: 'paste' | 'link' | 'file' }`, returns structured `{ headline, author, publication, publishedAt, body }` with `commit: false` by default; a second call with `commit: true` plus the edited fields performs the `shared_article_content` + `topic_articles` insert (keeping the existing idempotency key).
- PDF: `unpdf` for the text layer; if under a word threshold, rasterise and pass pages to the vision OCR path already used for images.
- Link mode reuses the existing article extraction shared helper rather than adding a second scraper.
- `source_domain` derives from the pasted URL or user-entered publication, falling back to `manual` only when unknown.
- Storage path change is client-side only; no bucket policy changes needed.
- Dashboard: `TopicDashboard.tsx` swaps the collapsible for a single "Add story" button next to the pipeline header.
