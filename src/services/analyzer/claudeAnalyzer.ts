import Anthropic from '@anthropic-ai/sdk';
import { validateAnalysis } from '@/domain/nutritionValidation';
import type { MealAnalysis } from '@/domain/types';
import { AnalyzerError, type AnalyzeInput, type MealAnalyzer } from './types';

/**
 * Claude vision analyzer — spec §7.2.
 *
 * DEMO ARCHITECTURE NOTE: this calls Anthropic directly with a user-supplied
 * key (hence `dangerouslyAllowBrowser`). A production release must route
 * through a backend proxy that holds the key server-side; this class is the
 * seam where that proxy client replaces the direct client (spec §7.2).
 */

export const CLAUDE_MODEL = 'claude-opus-4-8';

export const ANALYSIS_SYSTEM_PROMPT = `You are a registered-dietitian-grade nutrition estimator for a food-tracking app.
Estimate the nutrition of the ENTIRE pictured portion (not per 100 g, not per serving).
Reconcile the photo with the user's description; the description wins for details the photo can't show (e.g. "light dressing", "oat milk").
Return realistic values for typical US portions. Round sensibly (calories to 5, grams to 0.5).
Rules:
- foodItems: 1-10 short names of the distinct foods you identify, most prominent first.
- fruitVegServings: standard produce servings (1 serving ≈ 1 cup raw leafy / 0.5 cup cooked veg / 1 medium fruit). Potatoes/fries don't count.
- processingLevel: NOVA-inspired 1-4 (1 unprocessed/minimally processed, 2 processed culinary ingredients in home cooking, 3 processed, 4 ultra-processed).
- confidence: "high" only with a clear photo of identifiable food; "medium" when reasonably sure; "low" when the photo is ambiguous, partially visible, or absent.
- If there is no photo, estimate from the description alone and cap confidence at "medium".
- If neither shows food, return your best guess for the described meal type with confidence "low".`;

const ANALYSIS_SCHEMA = {
  type: 'object',
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
  additionalProperties: false,
} as const;

/** Minimal client surface we depend on — lets tests inject a fake. */
export interface ClaudeClientLike {
  messages: {
    create(params: Record<string, unknown>): Promise<{
      stop_reason: string | null;
      content: { type: string; text?: string }[];
    }>;
  };
}

export function defaultClientFactory(apiKey: string): ClaudeClientLike {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true }) as unknown as ClaudeClientLike;
}

export class ClaudeMealAnalyzer implements MealAnalyzer {
  readonly kind = 'claude' as const;
  private readonly apiKey: string;
  private readonly clientFactory: (apiKey: string) => ClaudeClientLike;

  constructor(apiKey: string, clientFactory: (apiKey: string) => ClaudeClientLike = defaultClientFactory) {
    this.apiKey = apiKey;
    this.clientFactory = clientFactory;
  }

  async analyze(input: AnalyzeInput): Promise<MealAnalysis> {
    const description = input.description?.trim() ?? '';
    if (!description && !input.photoBase64) {
      throw new AnalyzerError('empty-input', 'Add a photo or a description to analyze.');
    }

    const content: Record<string, unknown>[] = [];
    if (input.photoBase64) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: input.photoMediaType ?? 'image/jpeg',
          data: input.photoBase64,
        },
      });
    }
    content.push({
      type: 'text',
      text:
        `Meal type: ${input.mealType}.` +
        (description ? ` User description: "${description}"` : ' No description provided.') +
        (input.photoBase64 ? '' : ' No photo provided.'),
    });

    const client = this.clientFactory(this.apiKey);

    let response: Awaited<ReturnType<ClaudeClientLike['messages']['create']>>;
    try {
      response = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        system: ANALYSIS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
        output_config: { format: { type: 'json_schema', schema: ANALYSIS_SCHEMA } },
      });
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) {
        throw new AnalyzerError('auth', 'Your Claude API key was rejected.');
      }
      throw new AnalyzerError('network', `Could not reach Claude: ${(error as Error).message}`);
    }

    if (response.stop_reason === 'refusal') {
      throw new AnalyzerError('refusal', 'Claude declined to analyze this image.');
    }

    const text = response.content.find((block) => block.type === 'text')?.text;
    if (!text) {
      throw new AnalyzerError('parse', 'Claude returned no analysis text.');
    }

    try {
      return validateAnalysis(JSON.parse(text) as Partial<MealAnalysis>);
    } catch {
      throw new AnalyzerError('parse', 'Claude returned unparseable analysis JSON.');
    }
  }
}

/** Settings "Test key" action — free Models-API lookup (spec §F7). */
export async function testApiKey(
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<'valid' | 'auth' | 'network'> {
  try {
    const response = await fetchFn(`https://api.anthropic.com/v1/models/${CLAUDE_MODEL}`, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    });
    if (response.ok) return 'valid';
    if (response.status === 401 || response.status === 403) return 'auth';
    return 'network';
  } catch {
    return 'network';
  }
}
