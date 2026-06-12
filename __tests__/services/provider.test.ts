import { runAnalysis } from '@/services/analyzer/provider';
import { AnalyzerError, type MealAnalyzer } from '@/services/analyzer/types';
import type { MealAnalysis } from '@/domain/types';

const CLAUDE_RESULT: MealAnalysis = {
  calories: 500, proteinG: 30, carbsG: 50, fatG: 15,
  fiberG: 5, sugarG: 5, sodiumMg: 400, saturatedFatG: 3,
  fruitVegServings: 1, processingLevel: 2, confidence: 'high', foodItems: ['claude meal'],
};

const ESTIMATE_RESULT: MealAnalysis = {
  ...CLAUDE_RESULT, confidence: 'medium', foodItems: ['estimated meal'],
};

function stubAnalyzer(kind: 'claude' | 'estimate', impl: () => Promise<MealAnalysis>): MealAnalyzer {
  return { kind, analyze: jest.fn(impl) };
}

const input = { description: 'lunch bowl', mealType: 'lunch' as const };

describe('runAnalysis', () => {
  it('uses the estimator when no API key is configured', async () => {
    const estimator = stubAnalyzer('estimate', async () => ESTIMATE_RESULT);
    const claude = stubAnalyzer('claude', async () => CLAUDE_RESULT);

    const outcome = await runAnalysis(input, {
      getApiKey: async () => null,
      makeClaude: () => claude,
      makeEstimator: () => estimator,
    });

    expect(outcome.analyzerUsed).toBe('estimate');
    expect(outcome.fallbackNotice).toBeUndefined();
    expect(claude.analyze).not.toHaveBeenCalled();
  });

  it('uses Claude when a key is configured', async () => {
    const estimator = stubAnalyzer('estimate', async () => ESTIMATE_RESULT);
    const claude = stubAnalyzer('claude', async () => CLAUDE_RESULT);

    const outcome = await runAnalysis(input, {
      getApiKey: async () => 'sk-ant-key',
      makeClaude: () => claude,
      makeEstimator: () => estimator,
    });

    expect(outcome.analyzerUsed).toBe('claude');
    expect(outcome.analysis.foodItems).toEqual(['claude meal']);
    expect(estimator.analyze).not.toHaveBeenCalled();
  });

  it.each([
    ['network', /reach the analysis service/i],
    ['refusal', /couldn't analyze/i],
    ['parse', /didn't come through/i],
    ['auth', /sign-in needs attention/i],
  ] as const)('falls back to the estimator on Claude %s errors with low confidence', async (code, notice) => {
    const estimator = stubAnalyzer('estimate', async () => ESTIMATE_RESULT);
    const claude = stubAnalyzer('claude', async () => {
      throw new AnalyzerError(code, 'boom');
    });

    const outcome = await runAnalysis(input, {
      getApiKey: async () => 'sk-ant-key',
      makeClaude: () => claude,
      makeEstimator: () => estimator,
    });

    expect(outcome.analyzerUsed).toBe('estimate');
    expect(outcome.analysis.confidence).toBe('low');
    expect(outcome.fallbackNotice).toMatch(notice);
  });

  it('falls back on unexpected (non-AnalyzerError) failures too', async () => {
    const estimator = stubAnalyzer('estimate', async () => ESTIMATE_RESULT);
    const claude = stubAnalyzer('claude', async () => {
      throw new Error('something exploded');
    });

    const outcome = await runAnalysis(input, {
      getApiKey: async () => 'key',
      makeClaude: () => claude,
      makeEstimator: () => estimator,
    });

    expect(outcome.analyzerUsed).toBe('estimate');
    expect(outcome.fallbackNotice).toMatch(/reach the analysis service/i);
  });

  it('does NOT fall back on empty-input — that is a user error', async () => {
    const estimator = stubAnalyzer('estimate', async () => ESTIMATE_RESULT);
    const claude = stubAnalyzer('claude', async () => {
      throw new AnalyzerError('empty-input', 'nothing to analyze');
    });

    await expect(
      runAnalysis({ mealType: 'lunch' }, {
        getApiKey: async () => 'key',
        makeClaude: () => claude,
        makeEstimator: () => estimator,
      }),
    ).rejects.toMatchObject({ code: 'empty-input' });
    expect(estimator.analyze).not.toHaveBeenCalled();
  });
});
