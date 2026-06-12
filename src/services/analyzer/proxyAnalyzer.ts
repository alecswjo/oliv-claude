import { analyzeFunctionUrl } from '@/config';
import { validateAnalysis } from '@/domain/nutritionValidation';
import type { MealAnalysis } from '@/domain/types';
import { AnalyzerError, type AnalyzeInput, type MealAnalyzer } from './types';

// Lazy so the Supabase SDK is only loaded when the proxy actually runs
// (keeps it out of the offline/test module graph).
async function defaultGetToken(): Promise<string | null> {
  const { getAccessToken } = await import('@/services/supabase/client');
  return getAccessToken();
}

/**
 * Production analyzer — calls the Oliv backend (Supabase Edge Function), which
 * holds the LLM key server-side. The app never sees a provider key.
 *
 * The server returns a raw analysis; we run the same `validateAnalysis()` the
 * other analyzers use, so clamping/scoring is identical regardless of source.
 */
export class ProxyMealAnalyzer implements MealAnalyzer {
  readonly kind = 'proxy' as const;

  constructor(
    private readonly deps: {
      url?: string;
      fetchFn?: typeof fetch;
      getToken?: () => Promise<string | null>;
    } = {},
  ) {}

  async analyze(input: AnalyzeInput): Promise<MealAnalysis> {
    const description = input.description?.trim() ?? '';
    if (!description && !input.photoBase64) {
      throw new AnalyzerError('empty-input', 'Add a photo or a description to analyze.');
    }

    const fetchFn = this.deps.fetchFn ?? fetch;
    const url = this.deps.url ?? analyzeFunctionUrl();
    const getToken = this.deps.getToken ?? defaultGetToken;

    const token = await getToken();
    if (!token) {
      throw new AnalyzerError('auth', 'Sign in to analyze meals with AI.');
    }

    let response: Response;
    try {
      response = await fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          photoBase64: input.photoBase64,
          photoMediaType: input.photoMediaType,
          description: description || undefined,
          mealType: input.mealType,
        }),
      });
    } catch (error) {
      throw new AnalyzerError('network', `Could not reach the Oliv server: ${(error as Error).message}`);
    }

    if (response.status === 401 || response.status === 403) {
      throw new AnalyzerError('auth', 'Your session expired — sign in again.');
    }
    if (!response.ok) {
      throw new AnalyzerError('network', `Server returned ${response.status}.`);
    }

    let payload: { analysis?: Partial<MealAnalysis> };
    try {
      payload = await response.json();
    } catch {
      throw new AnalyzerError('parse', 'The server returned an unreadable response.');
    }
    if (!payload.analysis) {
      throw new AnalyzerError('parse', 'The server returned no analysis.');
    }

    return validateAnalysis(payload.analysis);
  }
}
