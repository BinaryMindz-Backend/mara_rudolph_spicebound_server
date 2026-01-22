import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isValidTrope, APPROVED_TROPES } from '../../../common/constants/tropes.js';
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
        return {};
      }

      const prompt = this.buildEnrichmentPrompt(bookData);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.configService.get<string>('openai.model') || 'gpt-4',
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
      });

      if (!response.ok) {
        this.logger.error(`OpenAI API error: ${response.statusText}`);
        return {};
      }

      const data = (await response.json()) as any;
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        this.logger.warn('Empty response from OpenAI');
        return {};
      }

      // Parse JSON response
      const enriched = JSON.parse(content);

      // Validate and sanitize output
      return this.sanitizeEnrichedData(enriched);
    } catch (error) {
      this.logger.error('AI enrichment failed', error);
      return {};
    }
  }

  private buildEnrichmentPrompt(bookData: any): string {
    return `
Analyze this romance book and return enriched metadata as JSON.

Book data:
- Title: ${bookData.title || 'unknown'}
- Author: ${bookData.author || 'unknown'}
- Description: ${bookData.description || 'none'}
- Genre: ${bookData.genre || 'unknown'}

Return ONLY this JSON structure (no markdown):
{
  "ageLevel": "YA" | "NA" | "ADULT" | "EROTICA",
  "spiceRating": 0-6,
  "tropes": ["trope1", "trope2", "trope3"],
  "creatures": ["creature1", "creature2"],
  "subgenres": ["subgenre1", "subgenre2"],
  "series": {
    "name": "series name or null",
    "status": "COMPLETE" | "INCOMPLETE" | "UNKNOWN"
  }
}

Allowed tropes: ${APPROVED_TROPES.join(', ')}

Be conservative: if unsure, omit the field or return fewer tropes (min 1).
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
    }

    // Validate spiceRating
    if (
      typeof data.spiceRating === 'number' &&
      isValidSpiceRating(data.spiceRating)
    ) {
      sanitized.spiceRating = data.spiceRating;
    }

    // Validate tropes
    if (
      Array.isArray(data.tropes) &&
      data.tropes.length > 0 &&
      data.tropes.every((t: any) => isValidTrope(t))
    ) {
      sanitized.tropes = data.tropes.slice(0, 4); // Max 4 tropes
    }

    // Validate creatures
    if (Array.isArray(data.creatures) && data.creatures.length > 0) {
      sanitized.creatures = data.creatures
        .filter((c: any) => typeof c === 'string')
        .slice(0, 3); // Max 3
    }

    // Validate subgenres
    if (Array.isArray(data.subgenres) && data.subgenres.length > 0) {
      sanitized.subgenres = data.subgenres
        .filter((s: any) => typeof s === 'string')
        .slice(0, 3); // Max 3
    }

    // Preserve series info
    if (data.series && typeof data.series === 'object') {
      sanitized.series = data.series;
    }

    return sanitized;
  }
}
