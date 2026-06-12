import { isBackendConfigured } from '@/config';
import type { MealAnalysis } from '@/domain/types';
import { EstimateMealAnalyzer } from './estimateAnalyzer';
import { ProxyMealAnalyzer } from './proxyAnalyzer';
import { AnalyzerError, type AnalyzeInput, type MealAnalyzer } from './types';

/**
 * Analyzer selection & fallback — spec §F2.5.
 *
 * Precedence:
 *   1. Backend proxy (server-side key) — when a Supabase backend is configured.
 *   2. Deterministic offline estimator — always available.
 *
 * Any analysis failure (network/refusal/parse/auth) falls back to the
 * estimator with confidence downgraded to `low`, plus a notice for the UI.
 */

export type AnalyzerUsed = 'proxy' | 'estimate';

export interface AnalysisOutcome {
  analysis: MealAnalysis;
  analyzerUsed: AnalyzerUsed;
  fallbackNotice?: string;
}

export interface AnalyzerDeps {
  /** Defaults to whether a Supabase backend is configured. */
  useBackend?: boolean;
  makeProxy?(): MealAnalyzer;
  makeEstimator?(): MealAnalyzer;
}

const FALLBACK_NOTICES: Record<string, string> = {
  refusal: "We couldn't analyze this one — here's an offline estimate instead.",
  parse: "The analysis didn't come through cleanly — here's an offline estimate instead.",
  network: "Couldn't reach the analysis service — here's an offline estimate instead.",
  auth: 'Your session needs attention — using an offline estimate for now.',
};

export async function runAnalysis(
  input: AnalyzeInput,
  deps: AnalyzerDeps = {},
): Promise<AnalysisOutcome> {
  const makeEstimator = deps.makeEstimator ?? (() => new EstimateMealAnalyzer());
  const useBackend = deps.useBackend ?? isBackendConfigured();

  if (!useBackend) {
    return { analysis: await makeEstimator().analyze(input), analyzerUsed: 'estimate' };
  }

  const makeProxy = deps.makeProxy ?? (() => new ProxyMealAnalyzer());
  try {
    return { analysis: await makeProxy().analyze(input), analyzerUsed: 'proxy' };
  } catch (error) {
    // Empty input is a user error, not an analyzer failure — never fall back.
    if (error instanceof AnalyzerError && error.code === 'empty-input') throw error;
    const code = error instanceof AnalyzerError ? error.code : 'network';
    const analysis = await makeEstimator().analyze(input);
    return {
      analysis: { ...analysis, confidence: 'low' },
      analyzerUsed: 'estimate',
      fallbackNotice: FALLBACK_NOTICES[code] ?? FALLBACK_NOTICES.network,
    };
  }
}
