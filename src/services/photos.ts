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

/** Copy a (cache) photo into the documents dir; returns the durable URI. */
export function persistPhoto(tempUri: string, mealId: string): string {
  const source = new File(tempUri);
  const target = new File(Paths.document, `meal-${mealId}.jpg`);
  if (target.exists) target.delete();
  source.copySync(target);
  return target.uri;
}

export function deletePhoto(uri: string | undefined): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // best-effort cleanup
  }
}
