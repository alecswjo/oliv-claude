import type { MealAnalysis, MealType } from '@/domain/types';

export interface AnalyzePhoto {
  /** Base64 JPEG/PNG payload (no data: prefix). */
  base64: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export const MAX_ANALYZE_PHOTOS = 5;

export interface AnalyzeInput {
  /** Up to MAX_ANALYZE_PHOTOS photos of the same meal. */
  photos?: AnalyzePhoto[];
  description?: string;
  mealType: MealType;
}

export interface MealAnalyzer {
  readonly kind: 'estimate' | 'proxy';
  analyze(input: AnalyzeInput): Promise<MealAnalysis>;
}

export type AnalyzerErrorCode = 'refusal' | 'parse' | 'network' | 'auth' | 'empty-input';

export class AnalyzerError extends Error {
  readonly code: AnalyzerErrorCode;

  constructor(code: AnalyzerErrorCode, message: string) {
    super(message);
    this.name = 'AnalyzerError';
    this.code = code;
  }
}
