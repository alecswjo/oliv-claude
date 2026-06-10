import {
  ANALYSIS_SYSTEM_PROMPT,
  CLAUDE_MODEL,
  ClaudeMealAnalyzer,
  testApiKey,
  type ClaudeClientLike,
} from '@/services/analyzer/claudeAnalyzer';
import { AnalyzerError } from '@/services/analyzer/types';

const GOOD_ANALYSIS = {
  foodItems: ['grilled salmon', 'quinoa', 'broccoli'],
  calories: 520, proteinG: 42, carbsG: 38, fatG: 21,
  fiberG: 8, sugarG: 5, sodiumMg: 380, saturatedFatG: 4,
  fruitVegServings: 2.5, processingLevel: 1, confidence: 'high',
};

function fakeClient(response: { stop_reason: string | null; content: { type: string; text?: string }[] }) {
  const create = jest.fn().mockResolvedValue(response);
  const client: ClaudeClientLike = { messages: { create } };
  return { client, create };
}

function analyzerWith(client: ClaudeClientLike) {
  return new ClaudeMealAnalyzer('sk-ant-test', () => client);
}

describe('ClaudeMealAnalyzer', () => {
  it('sends the documented request shape (model, image block, schema, max_tokens)', async () => {
    const { client, create } = fakeClient({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify(GOOD_ANALYSIS) }],
    });

    await analyzerWith(client).analyze({
      photoBase64: 'BASE64DATA',
      photoMediaType: 'image/jpeg',
      description: 'salmon dinner',
      mealType: 'dinner',
    });

    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0][0];
    expect(params.model).toBe(CLAUDE_MODEL);
    expect(params.model).toBe('claude-opus-4-8');
    expect(params.max_tokens).toBe(16000);
    expect(params.system).toBe(ANALYSIS_SYSTEM_PROMPT);

    const content = params.messages[0].content;
    expect(content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'BASE64DATA' },
    });
    expect(content[1].type).toBe('text');
    expect(content[1].text).toContain('salmon dinner');
    expect(content[1].text).toContain('dinner');

    expect(params.output_config.format.type).toBe('json_schema');
    expect(params.output_config.format.schema.additionalProperties).toBe(false);
    expect(params.output_config.format.schema.required).toContain('calories');
  });

  it('omits the image block for description-only input and says so in the text', async () => {
    const { client, create } = fakeClient({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify(GOOD_ANALYSIS) }],
    });

    await analyzerWith(client).analyze({ description: 'oatmeal', mealType: 'breakfast' });

    const content = create.mock.calls[0][0].messages[0].content;
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe('text');
    expect(content[0].text).toContain('No photo provided');
  });

  it('parses and validates a good response', async () => {
    const { client } = fakeClient({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify(GOOD_ANALYSIS) }],
    });

    const result = await analyzerWith(client).analyze({ description: 'salmon', mealType: 'dinner' });
    expect(result.calories).toBe(520);
    expect(result.confidence).toBe('high');
    expect(result.foodItems).toEqual(GOOD_ANALYSIS.foodItems);
  });

  it('clamps out-of-range values from the model', async () => {
    const { client } = fakeClient({
      stop_reason: 'end_turn',
      content: [{
        type: 'text',
        text: JSON.stringify({ ...GOOD_ANALYSIS, calories: 99999, fruitVegServings: 40 }),
      }],
    });

    const result = await analyzerWith(client).analyze({ description: 'feast', mealType: 'dinner' });
    expect(result.calories).toBe(5000);
    expect(result.fruitVegServings).toBe(10);
  });

  it('throws a refusal error on stop_reason "refusal"', async () => {
    const { client } = fakeClient({ stop_reason: 'refusal', content: [] });
    await expect(
      analyzerWith(client).analyze({ description: 'food', mealType: 'lunch' }),
    ).rejects.toMatchObject({ code: 'refusal' });
  });

  it('throws a parse error on malformed JSON', async () => {
    const { client } = fakeClient({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'not json {' }],
    });
    await expect(
      analyzerWith(client).analyze({ description: 'food', mealType: 'lunch' }),
    ).rejects.toMatchObject({ code: 'parse' });
  });

  it('throws a parse error when there is no text block', async () => {
    const { client } = fakeClient({ stop_reason: 'end_turn', content: [] });
    await expect(
      analyzerWith(client).analyze({ description: 'food', mealType: 'lunch' }),
    ).rejects.toMatchObject({ code: 'parse' });
  });

  it('maps 401/403 to an auth error and other failures to network', async () => {
    const authClient: ClaudeClientLike = {
      messages: { create: jest.fn().mockRejectedValue(Object.assign(new Error('unauthorized'), { status: 401 })) },
    };
    await expect(
      analyzerWith(authClient).analyze({ description: 'food', mealType: 'lunch' }),
    ).rejects.toMatchObject({ code: 'auth' });

    const downClient: ClaudeClientLike = {
      messages: { create: jest.fn().mockRejectedValue(new Error('socket hang up')) },
    };
    await expect(
      analyzerWith(downClient).analyze({ description: 'food', mealType: 'lunch' }),
    ).rejects.toMatchObject({ code: 'network' });
  });

  it('rejects empty input without calling the API', async () => {
    const { client, create } = fakeClient({ stop_reason: 'end_turn', content: [] });
    await expect(analyzerWith(client).analyze({ mealType: 'lunch' })).rejects.toMatchObject({
      code: 'empty-input',
    });
    expect(create).not.toHaveBeenCalled();
  });
});

describe('testApiKey', () => {
  it('returns valid on 200', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    expect(await testApiKey('sk-ant-x', fetchFn as never)).toBe('valid');
    expect(fetchFn.mock.calls[0][0]).toContain('/v1/models/claude-opus-4-8');
    expect(fetchFn.mock.calls[0][1].headers['x-api-key']).toBe('sk-ant-x');
  });

  it('returns auth on 401/403', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 401 });
    expect(await testApiKey('bad', fetchFn as never)).toBe('auth');
  });

  it('returns network on fetch failure or 5xx', async () => {
    const reject = jest.fn().mockRejectedValue(new Error('offline'));
    expect(await testApiKey('sk', reject as never)).toBe('network');
    const serverErr = jest.fn().mockResolvedValue({ ok: false, status: 529 });
    expect(await testApiKey('sk', serverErr as never)).toBe('network');
  });
});
