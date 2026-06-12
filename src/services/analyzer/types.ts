import type { MealAnalysis, MealType } from '@/domain/types';

export interface AnalyzeInput {
  /** Base64 JPEG/PNG payload (no data: prefix). */
  photoBase64?: string;
  photoMediaType?: 'image/jpeg' | 'image/png' | 'image/webp';
  description?: string;
  mealType: MealType;
}

export interface MealAnalyzer {
  readonly kind: 'claude' | 'estimate' | 'proxy';
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
