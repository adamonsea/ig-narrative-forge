/** The only places AI is named to readers and owners. Copy rules: project knowledge, "Positioning and language". */
export const READER_LINE = "Each story is summarised from the original reporting and links back to it.";
export const AI_SUMMARY_TAG = "AI-assisted summary";
/** Last slide, above "Read the full story": shown on every feed. */
export const aiSummaryLine = (source: string) => `AI-assisted summary of reporting by ${source}.`;
export const FIRST_PAGE_NOTE_LABEL = "Also show the note on the first page (needed for EU feeds on Autopilot)";
export const OWNER_LINE =
  "Highlights are summarised from the original reporting with AI help. You approve them, or let Autopilot publish within your rules.";
