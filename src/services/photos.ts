import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Photo handling — spec §7.2 / §8.
 * - Analysis payload: long edge ≤ 1568 px, JPEG q0.7, returned as base64.
 * - Persistence: saved meals copy their photo into the app documents dir so
 *   the URI outlives the picker/manipulator caches.
 */

export const ANALYSIS_MAX_DIMENSION = 1568;
export const ANALYSIS_JPEG_QUALITY = 0.7;

export interface PreparedPhoto {
  base64: string;
  uri: string;
  mediaType: 'image/jpeg';
}

export async function preparePhotoForAnalysis(
  sourceUri: string,
  sourceWidth?: number,
  sourceHeight?: number,
): Promise<PreparedPhoto> {
  const context = ImageManipulator.manipulate(sourceUri);

  const longEdge = Math.max(sourceWidth ?? 0, sourceHeight ?? 0);
  if (longEdge > ANALYSIS_MAX_DIMENSION) {
    if ((sourceWidth ?? 0) >= (sourceHeight ?? 0)) {
      context.resize({ width: ANALYSIS_MAX_DIMENSION });
    } else {
      context.resize({ height: ANALYSIS_MAX_DIMENSION });
    }
  }

  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: ANALYSIS_JPEG_QUALITY,
    base64: true,
  });

  return {
    base64: result.base64 ?? '',
    uri: result.uri,
    mediaType: 'image/jpeg',
  };
}

/**
 * Persist a picked photo so its URI outlives the picker/manipulator caches.
 * Native: copy into the documents dir. Web (no file system): fall back to a
 * base64 data URI — unlike a blob: URL it survives page reloads, which is what
 * made saved photos go blank after refresh.
 */
export function persistPhoto(photo: PreparedPhoto, mealId: string, index = 0): string {
  try {
    const source = new File(photo.uri);
    const target = new File(Paths.document, `meal-${mealId}-${index}.jpg`);
    if (target.exists) target.delete();
    source.copySync(target);
    return target.uri;
  } catch {
    return photo.base64 ? `data:${photo.mediaType};base64,${photo.base64}` : photo.uri;
  }
}

export function persistPhotos(photos: PreparedPhoto[], mealId: string): string[] {
  return photos.map((photo, index) => persistPhoto(photo, mealId, index));
}

export function deletePhotos(uris: string[] | undefined): void {
  for (const uri of uris ?? []) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // best-effort cleanup (no-op for data:/https: URIs and on web)
    }
  }
}
