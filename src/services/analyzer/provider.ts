import type { MealAnalysis } from '@/domain/types';
import { ClaudeMealAnalyzer } from './claudeAnalyzer';
import { EstimateMealAnalyzer } from './estimateAnalyzer';
import { AnalyzerError, type AnalyzeInput, type MealAnalyzer } from './types';

/**
 * Analyzer selection & fallback — spec §F2.5.
 * Claude when a key is configured; the deterministic estimator otherwise.
 * Claude failures (network/refusal/parse/auth) fall back to the estimator
 * with confidence downgraded to `low`, plus a notice for the UI.
 */

export interface AnalysisOutcome {
  analysis: MealAnalysis;
  analyzerUsed: 'claude' | 'estimate';
  fallbackNotice?: string;
}

export interface AnalyzerDeps {
  getApiKey(): Promise<string | null>;
  makeClaude?(apiKey: string): MealAnalyzer;
  makeEstimator?(): MealAnalyzer;
}

const FALLBACK_NOTICES: Record<string, string> = {
  refusal: "Claude couldn't analyze this one — here's an offline estimate instead.",
  parse: "Claude's answer didn't come through cleanly — here's an offline estimate instead.",
  network: "Couldn't reach Claude — here's an offline estimate instead.",
  auth: 'Your Claude API key was rejected — using an offline estimate. Check it in Settings.',
};

export async function runAnalysis(input: AnalyzeInput, deps: AnalyzerDeps): Promise<AnalysisOutcome> {
  const makeEstimator = deps.makeEstimator ?? (() => new EstimateMealAnalyzer());
  const makeClaude = deps.makeClaude ?? ((apiKey: string) => new ClaudeMealAnalyzer(apiKey));

  const apiKey = await deps.getApiKey();

  if (!apiKey) {
    const analysis = await makeEstimator().analyze(input);
    return { analysis, analyzerUsed: 'estimate' };
  }

  try {
    const analysis = await makeClaude(apiKey).analyze(input);
    return { analysis, analyzerUsed: 'claude' };
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
