import { supabase } from "@/integrations/supabase/client";
import { isStoredEventPhoto } from "./eventPhotoPath";

/**
 * Public address of Curatr's stored copy of an event photo.
 * Only stored copies are shown — never the venue's own image address.
 */
export function eventPhotoUrl(path: string | null | undefined): string | null {
  if (!isStoredEventPhoto(path)) return null;
  return supabase.storage.from("topic-assets").getPublicUrl(path).data.publicUrl;
}
