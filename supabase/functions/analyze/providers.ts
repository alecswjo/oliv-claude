// Provider abstraction for meal-photo analysis. The server holds the key; the
// app never sees it. Active provider is selected by the ANALYZE_PROVIDER env
// var (default "openai"). Adding Gemini/Anthropic later = another case here.

export interface AnalyzePhoto {
  base64: string;
  mediaType: string; // image/jpeg | image/png | image/webp
}

export const MAX_PHOTOS = 5;

export interface AnalyzeInput {
  /** Up to MAX_PHOTOS photos of the same meal. */
  photos?: AnalyzePhoto[];
  description?: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
}

// Mirrors the app's MealAnalysis contract (src/domain/types.ts). The client
// re-validates/clamps this via validateAnalysis(), so this is the wire shape.
export interface RawMealAnalysis {
  foodItems: string[];
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  saturatedFatG: number;
  fruitVegServings: number;
  processingLevel: 1 | 2 | 3 | 4;
  confidence: 'high' | 'medium' | 'low';
}

export const SYSTEM_PROMPT =
  `You are a registered-dietitian-grade nutrition estimator for a food-tracking app.
Estimate the nutrition of the ENTIRE pictured portion (not per 100 g, not per serving).
Reconcile the photo with the user's description; the description wins for details the photo can't show (e.g. "light dressing", "oat milk").
Multiple photos are different angles/parts of the SAME meal — estimate the meal once, not per photo.
Return realistic values for typical US portions.
- foodItems: 1-10 short names of the distinct foods, most prominent first.
- fruitVegServings: standard produce servings (1 serving ≈ 1 cup raw leafy / 0.5 cup cooked veg / 1 medium fruit). Potatoes/fries don't count.
- processingLevel: NOVA-inspired 1-4 (1 unprocessed, 2 processed culinary ingredients, 3 processed, 4 ultra-processed).
- confidence: "high" only with a clear photo of identifiable food; "medium" when reasonably sure; "low" when ambiguous, partial, or absent.
- If there is no photo, estimate from the description alone and cap confidence at "medium".`;

// JSON schema shared across providers that support structured outputs.
export const ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    foodItems: { type: 'array', items: { type: 'string' } },
    calories: { type: 'number' },
    proteinG: { type: 'number' },
    carbsG: { type: 'number' },
    fatG: { type: 'number' },
    fiberG: { type: 'number' },
    sugarG: { type: 'number' },
    sodiumMg: { type: 'number' },
    saturatedFatG: { type: 'number' },
    fruitVegServings: { type: 'number' },
    processingLevel: { type: 'integer', enum: [1, 2, 3, 4] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: [
    'foodItems', 'calories', 'proteinG', 'carbsG', 'fatG', 'fiberG',
    'sugarG', 'sodiumMg', 'saturatedFatG', 'fruitVegServings',
    'processingLevel', 'confidence',
  ],
} as const;

export class ProviderError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

function userText(input: AnalyzeInput): string {
  const desc = input.description?.trim();
  const count = input.photos?.length ?? 0;
  return (
    `Meal type: ${input.mealType}.` +
    (desc ? ` User description: "${desc}".` : ' No description provided.') +
    (count === 0 ? ' No photo provided.' : count > 1 ? ` ${count} photos of the same meal.` : '')
  );
}

/** OpenAI (gpt-5.5) via Chat Completions with vision + structured outputs. */
async function analyzeWithOpenAI(input: AnalyzeInput): Promise<RawMealAnalysis> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new ProviderError('OPENAI_API_KEY is not configured on the server', 500);
  const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-5.5';
  const baseUrl = Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1';

  const content: unknown[] = [{ type: 'text', text: userText(input) }];
  for (const photo of input.photos ?? []) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${photo.mediaType};base64,${photo.base64}` },
    });
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'meal_analysis', strict: true, schema: ANALYSIS_JSON_SCHEMA },
        },
        // gpt-5.5 is a reasoning model: at default effort an image request can
        // spend the whole completion budget on reasoning and return empty
        // content (finish_reason "length"). Low effort answers this task well.
        reasoning_effort: 'low',
        max_completion_tokens: 4000,
      }),
      // A hung upstream must not pin the request until the runtime wall clock.
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new ProviderError('The analysis provider timed out', 504);
    }
    throw new ProviderError('Could not reach the analysis provider', 502);
  }

  if (!res.ok) {
    const body = await res.text();
    // Log upstream detail server-side only; clients get a generic message.
    console.error(`OpenAI error ${res.status}: ${body.slice(0, 500)}`);
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError('The configured OpenAI key was rejected', 500);
    }
    throw new ProviderError('The analysis provider returned an error', 502);
  }

  const json = await res.json();
  const text: string | undefined = json?.choices?.[0]?.message?.content;
  if (!text) throw new ProviderError('OpenAI returned no analysis text', 502);
  try {
    return JSON.parse(text) as RawMealAnalysis;
  } catch {
    throw new ProviderError('OpenAI returned unparseable analysis JSON', 502);
  }
}

/** Anthropic (Claude Opus 4.8) via the Messages API with structured outputs. */
async function analyzeWithAnthropic(input: AnalyzeInput): Promise<RawMealAnalysis> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new ProviderError('ANTHROPIC_API_KEY is not configured on the server', 500);
  const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-opus-4-8';

  const content: unknown[] = [{ type: 'text', text: userText(input) }];
  for (const photo of input.photos ?? []) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: photo.mediaType, data: photo.base64 },
    });
  }

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
        // Fast extraction task: low effort; thinking stays off by default on
        // Opus 4.8 when the `thinking` param is omitted.
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: ANALYSIS_JSON_SCHEMA },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new ProviderError('The analysis provider timed out', 504);
    }
    throw new ProviderError('Could not reach the analysis provider', 502);
  }

  if (!res.ok) {
    console.error(`Anthropic error ${res.status}: ${(await res.text()).slice(0, 500)}`);
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError('The configured Anthropic key was rejected', 500);
    }
    throw new ProviderError('The analysis provider returned an error', 502);
  }

  const json = await res.json();
  if (json?.stop_reason === 'refusal') {
    throw new ProviderError('The analysis provider declined this request', 502);
  }
  const text: string | undefined = (json?.content ?? []).find(
    (b: { type: string }) => b.type === 'text',
  )?.text;
  if (!text) throw new ProviderError('Anthropic returned no analysis text', 502);
  try {
    return JSON.parse(text) as RawMealAnalysis;
  } catch {
    throw new ProviderError('Anthropic returned unparseable analysis JSON', 502);
  }
}

/** Google Gemini via the Generative Language REST API with a response schema. */
async function analyzeWithGemini(input: AnalyzeInput): Promise<RawMealAnalysis> {
  const apiKey = Deno.env.get('GOOGLE_API_KEY');
  if (!apiKey) throw new ProviderError('GOOGLE_API_KEY is not configured on the server', 500);
  const model = Deno.env.get('GOOGLE_MODEL') ?? 'gemini-2.5-flash';

  const parts: unknown[] = [{ text: `${SYSTEM_PROMPT}\n\n${userText(input)}` }];
  for (const photo of input.photos ?? []) {
    parts.push({ inline_data: { mime_type: photo.mediaType, data: photo.base64 } });
  }

  // Gemini's responseSchema is an OpenAPI subset: no additionalProperties.
  const { additionalProperties: _omit, ...geminiSchema } = ANALYSIS_JSON_SCHEMA as Record<
    string,
    unknown
  >;

  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: geminiSchema,
            maxOutputTokens: 2000,
          },
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new ProviderError('The analysis provider timed out', 504);
    }
    throw new ProviderError('Could not reach the analysis provider', 502);
  }

  if (!res.ok) {
    console.error(`Gemini error ${res.status}: ${(await res.text()).slice(0, 500)}`);
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError('The configured Google key was rejected', 500);
    }
    throw new ProviderError('The analysis provider returned an error', 502);
  }

  const json = await res.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new ProviderError('Gemini returned no analysis text', 502);
  try {
    return JSON.parse(text) as RawMealAnalysis;
  } catch {
    throw new ProviderError('Gemini returned unparseable analysis JSON', 502);
  }
}

export async function analyze(input: AnalyzeInput): Promise<RawMealAnalysis> {
  if (!input.photos?.length && !input.description?.trim()) {
    throw new ProviderError('Provide a photo or a description', 400);
  }
  const provider = Deno.env.get('ANALYZE_PROVIDER') ?? 'openai';
  switch (provider) {
    case 'openai':
      return analyzeWithOpenAI(input);
    case 'anthropic':
      return analyzeWithAnthropic(input);
    case 'gemini':
      return analyzeWithGemini(input);
    default:
      throw new ProviderError(`Unknown ANALYZE_PROVIDER "${provider}"`, 500);
  }
}
