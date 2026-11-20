import { FRAME_ASPECT, readFraming } from "@/lib/pictureFrame";
import { PictureEditor } from "./PictureEditor";
import { fetchStoredFile, saveEventPicture } from "./savePicture";

/** What the feed card band (wide) and the social poster (tall) keep of the square frame. */
const GUIDES = [{ aspect: 2, label: "Card" }, { aspect: 9 / 16, label: "Poster" }];

export interface EventPictureRow {
  image_path?: string | null | undefined;
  image_original_path?: string | null | undefined;
  image_framing?: unknown;
  image_hidden?: boolean | null | undefined;
}

/** Edit picture for one event: square frame with card and poster guides. */
export function EventPictureEditor({ eventId, topicId, detail, onDone, onCancel }: {
  eventId: string; topicId: string; detail: EventPictureRow;
  onDone: (saved: { image_path: string; image_original_path: string; image_framing: unknown }) => void;
  onCancel: () => void;
}) {
  const original = detail.image_original_path ?? detail.image_path ?? null;
  return (
    <PictureEditor
      aspect={FRAME_ASPECT.event}
      guides={GUIDES}
      initialFraming={detail.image_original_path ? readFraming(detail.image_framing) : null}
      loadSource={async () => (original ? fetchStoredFile(original) : null)}
      onCancel={onCancel}
      onSave={async (img, framing, replaced) => {
        const saved = await saveEventPicture({
          eventId, topicId, img, framing, aspect: FRAME_ASPECT.event, replaced,
          originalPath: replaced ? null : original,
          imageHidden: Boolean(detail.image_hidden),
        });
        onDone({ ...saved, image_framing: framing });
      }}
    />
  );
}
