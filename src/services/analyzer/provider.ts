import { isBackendConfigured } from '@/config';
import type { MealAnalysis } from '@/domain/types';
import { ClaudeMealAnalyzer } from './claudeAnalyzer';
import { EstimateMealAnalyzer } from './estimateAnalyzer';
import { ProxyMealAnalyzer } from './proxyAnalyzer';
import { AnalyzerError, type AnalyzeInput, type MealAnalyzer } from './types';

/**
 * Analyzer selection & fallback — spec §F2.5, extended for the production proxy.
 *
 * Precedence:
 *   1. Backend proxy (server-side key)  — when a Supabase backend is configured.
 *   2. Local Claude key                 — dev/demo, key pasted in Settings.
 *   3. Deterministic offline estimator  — always available.
 *
 * Any AI failure (network/refusal/parse/auth) falls back to the estimator with
 * confidence downgraded to `low`, plus a notice for the UI.
 */

export type AnalyzerUsed = 'proxy' | 'claude' | 'estimate';

export interface AnalysisOutcome {
  analysis: MealAnalysis;
  analyzerUsed: AnalyzerUsed;
  fallbackNotice?: string;
}

export interface AnalyzerDeps {
  getApiKey(): Promise<string | null>;
  /** Defaults to whether a Supabase backend is configured. */
  useBackend?: boolean;
  makeProxy?(): MealAnalyzer;
  makeClaude?(apiKey: string): MealAnalyzer;
  makeEstimator?(): MealAnalyzer;
}

const FALLBACK_NOTICES: Record<string, string> = {
  refusal: "The AI couldn't analyze this one — here's an offline estimate instead.",
  parse: "The AI's answer didn't come through cleanly — here's an offline estimate instead.",
  network: "Couldn't reach the analysis service — here's an offline estimate instead.",
  auth: 'Your AI sign-in needs attention — using an offline estimate for now.',
};

async function withEstimatorFallback(
  run: () => Promise<MealAnalysis>,
  used: AnalyzerUsed,
  makeEstimator: () => MealAnalyzer,
  input: AnalyzeInput,
): Promise<AnalysisOutcome> {
  try {
    return { analysis: await run(), analyzerUsed: used };
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

export async function runAnalysis(input: AnalyzeInput, deps: AnalyzerDeps): Promise<AnalysisOutcome> {
  const makeEstimator = deps.makeEstimator ?? (() => new EstimateMealAnalyzer());
  const makeClaude = deps.makeClaude ?? ((apiKey: string) => new ClaudeMealAnalyzer(apiKey));
  const makeProxy = deps.makeProxy ?? (() => new ProxyMealAnalyzer());
  const useBackend = deps.useBackend ?? isBackendConfigured();

  // 1. Production: server-side-key proxy.
  if (useBackend) {
    return withEstimatorFallback(() => makeProxy().analyze(input), 'proxy', makeEstimator, input);
  }

  // 2. Dev/demo: local Claude key.
  const apiKey = await deps.getApiKey();
  if (apiKey) {
    return withEstimatorFallback(() => makeClaude(apiKey).analyze(input), 'claude', makeEstimator, input);
  }

  // 3. Offline estimator.
  return { analysis: await makeEstimator().analyze(input), analyzerUsed: 'estimate' };
}
