import { File } from 'expo-file-system';
import { getSupabase } from './client';

const PHOTO_BUCKET = 'meal-photos';

/**
 * Read a photo's bytes for upload. On native a saved photo's URI is a `file://`
 * path, and `fetch(file://).blob()` is unreliable on iOS — it throws or yields
 * an empty body, so the upload silently fails and the meal gets stuck "saved on
 * this device". Read the bytes via expo-file-system instead. Web/remote URIs
 * (`data:`, `blob:`, `http(s):`) go through fetch, which handles them fully.
 */
async function readPhotoBody(uri: string): Promise<ArrayBuffer | Blob> {
  if (uri.startsWith('file:') || uri.startsWith('/')) {
    return new File(uri).arrayBuffer();
  }
  return (await fetch(uri)).blob();
}

/**
 * Upload a meal photo to Storage at `<userId>/<mealId>-<index>.jpg` and return
 * the storage path.
 */
export async function uploadMealPhoto(
  source: { fileUri?: string; base64?: string; mediaType?: string },
  userId: string,
  mealId: string,
  index = 0,
): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Backend not configured');

  const mediaType = source.mediaType ?? 'image/jpeg';
  const uri = source.fileUri ?? (source.base64 ? `data:${mediaType};base64,${source.base64}` : undefined);
  if (!uri) throw new Error('No photo source provided');

  const body = await readPhotoBody(uri);
  const path = `${userId}/${mealId}-${index}.jpg`;

  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, body, { contentType: mediaType, upsert: true });
  if (error) throw error;
  return path;
}

export async function deleteMealPhotos(paths: string[]): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || paths.length === 0) return;
  await supabase.storage.from(PHOTO_BUCKET).remove(paths);
}
