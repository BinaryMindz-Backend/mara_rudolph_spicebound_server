import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isValidTrope,
  APPROVED_TROPES,
} from '../../../common/constants/tropes.js';
import { isValidSpiceRating } from '../../../common/constants/spice-rating.js';

export interface EnrichedBookData {
  ageLevel?: string;
  spiceRating?: number;
  tropes?: string[];
  creatures?: string[];
  subgenres?: string[];
  series?: {
    name?: string;
    status?: string;
  };
}

@Injectable()
export class AiEnrichmentService {
  private readonly logger = new Logger(AiEnrichmentService.name);

  constructor(private configService: ConfigService) {}

  async enrichBook(bookData: any): Promise<EnrichedBookData> {
    try {
      const apiKey = this.configService.get<string>('openai.apiKey');

      if (!apiKey) {
        this.logger.warn(
          'OpenAI API key not configured, skipping AI enrichment',
        );
        return {
          ageLevel: 'UNKNOWN',
          spiceRating: 0,
          tropes: [],
          creatures: [],
          subgenres: [],
        };
      }

      const prompt = this.buildEnrichmentPrompt(bookData);
      const model =
        this.configService.get<string>('openai.model') || 'gpt-3.5-turbo';

      this.logger.log(`🔹 Calling OpenAI with model: ${model}`);
      this.logger.debug(
        `🔹 OpenAI API Key exists: ${apiKey.substring(0, 20)}...`,
      );

      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content:
                  'You are a romance book metadata enrichment engine. Return ONLY valid JSON, no markdown or extra text.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.5,
            max_tokens: 500,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error(
          `OpenAI API error: ${response.status} ${response.statusText}`,
          errorData,
        );
        return {
          ageLevel: 'UNKNOWN',
          spiceRating: 0,
          tropes: [],
          creatures: [],
          subgenres: [],
        };
      }

      const data = (await response.json()) as any;
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        this.logger.warn('Empty response from OpenAI');
        return {
          ageLevel: 'UNKNOWN',
          spiceRating: 0,
          tropes: [],
          creatures: [],
          subgenres: [],
        };
      }

      this.logger.debug(`🔹 OpenAI raw response: ${content}`);

      // Parse JSON response
      const enriched = JSON.parse(content);
      this.logger.log(`🔹 AI Enrichment parsed: ${JSON.stringify(enriched)}`);

      // Validate and sanitize output
      return this.sanitizeEnrichedData(enriched);
    } catch (error) {
      this.logger.error(
        'AI enrichment failed',
        error instanceof Error ? error.message : error,
      );
      return {
        ageLevel: 'UNKNOWN',
        spiceRating: 0,
        tropes: [],
        creatures: [],
        subgenres: [],
      };
    }
  }

  private buildEnrichmentPrompt(bookData: any): string {
    return `
You are a romance book metadata enrichment engine. Analyze this book and return metadata as valid JSON.

Book Information:
- Title: ${bookData.title || 'unknown'}
- Author: ${bookData.author || 'unknown'}
- Description: ${bookData.description || 'none provided'}

If this is NOT primarily a romance book, still classify it appropriately in the romance taxonomy.

Return ONLY this JSON structure (no markdown, no extra text):
{
  "ageLevel": "CHILDREN" | "YA" | "NA" | "ADULT" | "EROTICA" | "UNKNOWN",
  "spiceRating": 0-6,
  "tropes": ["trope1", "trope2"],
  "creatures": ["creature1", "creature2"],
  "subgenres": ["subgenre1", "subgenre2"],
  "series": {
    "name": "series name or null",
    "status": "COMPLETE" | "INCOMPLETE" | "UNKNOWN"
  }
}

Allowed tropes: ${APPROVED_TROPES.join(', ')}

Rules:
- spiceRating: 0=clean, 1=sweet/closed-door, 2=mild tension, 3=some scenes, 4=explicit, 5=very explicit, 6=erotica
- If unsure about a field, use minimum values (0 for spice, empty arrays for lists, UNKNOWN for levels)
- For Fourth Wing: This is fantasy romance with high spice and specific tropes - classify accurately
- Omit null series names from the series object

Examples:
- "Fourth Wing by Rebecca Yarros" -> ageLevel: NA, spiceRating: 4-5, tropes: [enemies-to-lovers, forbidden-romance, dragons]
- "Normal non-romance book" -> ageLevel: UNKNOWN, spiceRating: 0, tropes: [], subgenres: [NA or adult-fantasy]
`;
  }

  private sanitizeEnrichedData(data: any): EnrichedBookData {
    const sanitized: EnrichedBookData = {};

    // Validate ageLevel
    if (
      data.ageLevel &&
      ['CHILDREN', 'YA', 'NA', 'ADULT', 'EROTICA'].includes(data.ageLevel)
    ) {
      sanitized.ageLevel = data.ageLevel;
    } else {
      sanitized.ageLevel = 'UNKNOWN';
    }

    // Validate spiceRating
    if (
      typeof data.spiceRating === 'number' &&
      isValidSpiceRating(data.spiceRating)
    ) {
      sanitized.spiceRating = data.spiceRating;
    } else {
      sanitized.spiceRating = 0;
    }

    // Validate tropes
    if (
      Array.isArray(data.tropes) &&
      data.tropes.length > 0 &&
      data.tropes.every((t: any) => isValidTrope(t))
    ) {
      sanitized.tropes = data.tropes.slice(0, 4); // Max 4 tropes
    } else {
      sanitized.tropes = [];
    }

    // Validate creatures
    if (Array.isArray(data.creatures) && data.creatures.length > 0) {
      sanitized.creatures = data.creatures
        .filter((c: any) => typeof c === 'string')
        .slice(0, 3); // Max 3
    } else {
      sanitized.creatures = [];
    }

    // Validate subgenres
    if (Array.isArray(data.subgenres) && data.subgenres.length > 0) {
      sanitized.subgenres = data.subgenres
        .filter((s: any) => typeof s === 'string')
        .slice(0, 3); // Max 3
    } else {
      sanitized.subgenres = [];
    }

    // Preserve series info
    if (data.series && typeof data.series === 'object') {
      sanitized.series = data.series;
    }

    return sanitized;
  }
}
