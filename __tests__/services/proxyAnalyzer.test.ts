import { runAnalysis } from '@/services/analyzer/provider';
import { ProxyMealAnalyzer } from '@/services/analyzer/proxyAnalyzer';
import { AnalyzerError } from '@/services/analyzer/types';

const GOOD = {
  foodItems: ['grilled salmon', 'quinoa'],
  calories: 520, proteinG: 42, carbsG: 38, fatG: 21,
  fiberG: 8, sugarG: 5, sodiumMg: 380, saturatedFatG: 4,
  fruitVegServings: 2.5, processingLevel: 1, confidence: 'high',
};

function fakeFetch(status: number, body: unknown) {
  return jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

function analyzer(fetchFn: typeof fetch, token: string | null = 'jwt-token') {
  return new ProxyMealAnalyzer({
    url: 'https://x.supabase.co/functions/v1/analyze',
    fetchFn,
    getToken: async () => token,
  });
}

const input = { description: 'salmon bowl', mealType: 'dinner' as const };

describe('ProxyMealAnalyzer', () => {
  it('sends the auth token + payload and validates the returned analysis', async () => {
    const fetchFn = fakeFetch(200, { analysis: GOOD });
    const result = await analyzer(fetchFn).analyze({ ...input, photos: [{ base64: 'B64', mediaType: 'image/jpeg' }] });

    expect(result.calories).toBe(520);
    expect(result.confidence).toBe('high');
    const [url, opts] = (fetchFn as jest.Mock).mock.calls[0];
    expect(url).toContain('/functions/v1/analyze');
    expect(opts.headers.authorization).toBe('Bearer jwt-token');
    const sent = JSON.parse(opts.body);
    expect(sent).toMatchObject({ photos: [{ base64: 'B64', mediaType: 'image/jpeg' }], mealType: 'dinner', description: 'salmon bowl' });
  });

  it('clamps out-of-range server values via validateAnalysis', async () => {
    const fetchFn = fakeFetch(200, { analysis: { ...GOOD, calories: 99999, fruitVegServings: 40 } });
    const result = await analyzer(fetchFn).analyze(input);
    expect(result.calories).toBe(5000);
    expect(result.fruitVegServings).toBe(10);
  });

  it('throws auth error when there is no session token', async () => {
    const fetchFn = fakeFetch(200, { analysis: GOOD });
    await expect(analyzer(fetchFn, null).analyze(input)).rejects.toMatchObject({ code: 'auth' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('maps 401 to an auth error', async () => {
    await expect(analyzer(fakeFetch(401, {})).analyze(input)).rejects.toMatchObject({ code: 'auth' });
  });

  it('maps other non-OK statuses to network errors', async () => {
    await expect(analyzer(fakeFetch(500, {})).analyze(input)).rejects.toMatchObject({ code: 'network' });
  });

  it('throws parse error when the body has no analysis', async () => {
    await expect(analyzer(fakeFetch(200, { nope: true })).analyze(input)).rejects.toMatchObject({ code: 'parse' });
  });

  it('throws network error when fetch itself fails', async () => {
    const fetchFn = jest.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    await expect(analyzer(fetchFn).analyze(input)).rejects.toMatchObject({ code: 'network' });
  });

  it('rejects empty input without calling the server', async () => {
    const fetchFn = fakeFetch(200, { analysis: GOOD });
    await expect(analyzer(fetchFn).analyze({ mealType: 'lunch' })).rejects.toMatchObject({ code: 'empty-input' });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('provider backend precedence', () => {
  it('uses the proxy when the backend is active', async () => {
    const proxy = { kind: 'proxy' as const, analyze: jest.fn(async () => ({ ...GOOD } as never)) };
    const estimator = { kind: 'estimate' as const, analyze: jest.fn() };

    const outcome = await runAnalysis(input, {
      useBackend: true,
      makeProxy: () => proxy,
      makeEstimator: () => estimator,
    });

    expect(outcome.analyzerUsed).toBe('proxy');
    expect(proxy.analyze).toHaveBeenCalled();
    expect(estimator.analyze).not.toHaveBeenCalled();
  });

  it('falls back to the estimator when the proxy fails', async () => {
    const proxy = { kind: 'proxy' as const, analyze: jest.fn(async () => { throw new AnalyzerError('network', 'down'); }) };
    const estimator = { kind: 'estimate' as const, analyze: jest.fn(async () => ({ ...GOOD, confidence: 'medium' } as never)) };

    const outcome = await runAnalysis(input, {
      useBackend: true,
      makeProxy: () => proxy,
      makeEstimator: () => estimator,
    });

    expect(outcome.analyzerUsed).toBe('estimate');
    expect(outcome.analysis.confidence).toBe('low');
    expect(outcome.fallbackNotice).toMatch(/offline estimate/i);
  });
});
