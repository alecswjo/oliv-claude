import { getSupabase } from './client';

const PHOTO_BUCKET = 'meal-photos';

/**
 * Upload a meal photo to Storage at `<userId>/<mealId>-<index>.jpg` and return
 * the storage path. Reads the local file (or a base64/blob data URI) as a Blob
 * so it works in React Native and on web without atob/Buffer.
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

  const blob = await (await fetch(uri)).blob();
  const path = `${userId}/${mealId}-${index}.jpg`;

  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: mediaType, upsert: true });
  if (error) throw error;
  return path;
}

export async function deleteMealPhotos(paths: string[]): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || paths.length === 0) return;
  await supabase.storage.from(PHOTO_BUCKET).remove(paths);
}
