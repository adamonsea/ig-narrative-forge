/**
 * Why Autopilot left a gathered article for the owner, as one short card tag.
 * Pure rules from the article's own fields (held_reason written by auto-simplify-queue,
 * its quality score) and the feed's Autopilot bar; no tag when Autopilot is off,
 * because then every article waits on the owner anyway.
 */
export interface HoldTag {
  /** One to three words on the card. */
  label: string;
  /** One plain sentence for the tooltip. */
  detail: string;
}

export function holdReasonTag({
  heldReason,
  qualityScore,
  autopilotBar,
}: {
  heldReason?: string | null | undefined;
  qualityScore: number;
  /** The feed's Autopilot quality bar, or null when Autopilot is off. */
  autopilotBar: number | null;
}): HoldTag | null {
  if (autopilotBar === null) return null;
  const reason = (heldReason ?? "").trim();

  if (reason.startsWith("No place named")) {
    return { label: "No place named", detail: "No place from this feed is named, so Autopilot left it for you." };
  }
  const placed = reason.match(/^(Nearby|Further out) \(([^)]+)\)/);
  if (placed) {
    return { label: placed[1] === "Nearby" ? "Nearby" : "Further out", detail: `Names ${placed[2]}, so Autopilot left it for you.` };
  }
  if (reason.startsWith("category:")) {
    return { label: "Category", detail: "This category isn't set to publish on its own." };
  }
  if (qualityScore < autopilotBar) {
    return { label: `${qualityScore}% · needs ${autopilotBar}%`, detail: `Scored ${qualityScore}%. Autopilot writes stories from ${autopilotBar}%.` };
  }
  return null;
}
