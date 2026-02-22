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
    index?: number;
    total?: number;
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

      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(bookData);
      const model =
        this.configService.get<string>('openai.model') || 'gpt-4o-mini';

      this.logger.log(`🔹 Calling OpenAI with model: ${model}`);

      const requestBody = {
        model,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: 0.3, // Low temperature for consistent, factual responses
        max_tokens: 500,
        response_format: { type: 'json_object' },
      };

      // Log the request for debugging
      this.logger.debug(
        `🔹 OpenAI request body: ${JSON.stringify(requestBody, null, 2)}`,
      );

      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error(
          `OpenAI API error: ${response.status} ${response.statusText}`,
          JSON.stringify(errorData, null, 2),
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

  private buildSystemPrompt(): string {
    return `You are a romance book metadata enrichment engine. Your role is to analyze book information and classify it according to the Spicebound taxonomy.

CRITICAL RULES:
1. Return ONLY valid JSON, no markdown, no explanations, no extra text
2. All numerical ratings must be integers (0-6 for spice)
3. All arrays must contain strings from the approved lists ONLY
4. If a field cannot be determined with confidence, use the minimum/default value
5. Prefer precision over creativity - if unsure, use UNKNOWN or 0

YOUR RESPONSE MUST be valid JSON that can be parsed.`;
  }

  private buildUserPrompt(bookData: any): string {
    return `Analyze this book and return metadata as valid JSON.

Book Information:
- Title: ${bookData.title || 'unknown'}
- Author: ${bookData.author || 'unknown'}
- Description: ${bookData.description || 'none provided'}

SPICE RATING SCALE (must be an integer 0-6):
0 = None (no romantic content)
1 = Cute (kissing, hand-holding, innocent romance)
2 = Sweet (closed door - attraction clear, intimacy implied but not shown)
3 = Warm (1-3 open door scenes, not overly descriptive)
4 = Spicy (descriptive open door, often 2+ scenes, NA+ level)
5 = Hot Spicy (frequent, detailed scenes - characters can't keep hands off each other)
6 = Explicit/Kink (erotica-level - explicit kink, scenes are primary feature)

GUIDELINES:
- Spice Rating: Return ONLY a number 0-6 (not text like "very hot spice")
- Publication Year: Use the ORIGINAL publication year, not recent reprints or editions
- Age Level: Must be exactly one of: CHILDREN, YA, NA, ADULT, EROTICA, UNKNOWN
- Tropes: Select UP TO 4 from the approved list ONLY
- Creatures: UP TO 3 creatures/paranormal elements (or leave empty)
- Subgenres: UP TO 3 subgenres (or leave empty)
- Series: If this book is part of a series, provide status (COMPLETE or INCOMPLETE)

APPROVED TROPES (select from these ONLY):
${APPROVED_TROPES.join(', ')}

Return ONLY this JSON structure (valid JSON only, no markdown):
{
  "ageLevel": "CHILDREN" | "YA" | "NA" | "ADULT" | "EROTICA" | "UNKNOWN",
  "spiceRating": <integer 0-6>,
  "tropes": ["trope1", "trope2"],
  "creatures": ["creature1"],
  "subgenres": ["subgenre1"],
  "series": {
    "name": "series name" | null,
    "index": <position in series> | null,
    "total": <total books in series> | null,
    "status": "COMPLETE" | "INCOMPLETE" | "UNKNOWN"
  }
}`;
  }

  private sanitizeEnrichedData(data: any): EnrichedBookData {
    const sanitized: EnrichedBookData = {};

    // Validate ageLevel
    const validAgeLevels = ['CHILDREN', 'YA', 'NA', 'ADULT', 'EROTICA'];
    if (
      data.ageLevel &&
      validAgeLevels.includes(data.ageLevel.toUpperCase())
    ) {
      sanitized.ageLevel = data.ageLevel.toUpperCase();
    } else {
      sanitized.ageLevel = 'UNKNOWN';
    }

    // Validate spiceRating - must be integer 0-6
    if (
      typeof data.spiceRating === 'number' &&
      isValidSpiceRating(data.spiceRating)
    ) {
      sanitized.spiceRating = Math.floor(data.spiceRating);
    } else if (typeof data.spiceRating === 'string') {
      // Try to extract number from string like "3" or "very hot spice"
      const numMatch = data.spiceRating.match(/\d+/);
      if (numMatch) {
        const num = parseInt(numMatch[0], 10);
        sanitized.spiceRating = isValidSpiceRating(num) ? num : 0;
      } else {
        sanitized.spiceRating = 0;
      }
    } else {
      sanitized.spiceRating = 0;
    }

    // Auto-correct age level based on spice rating (high spice requires mature rating)
    if (
      sanitized.spiceRating &&
      sanitized.spiceRating >= 4 &&
      sanitized.ageLevel &&
      !['NA', 'ADULT', 'EROTICA'].includes(sanitized.ageLevel)
    ) {
      this.logger.warn(
        `Auto-correcting ageLevel from ${sanitized.ageLevel} to NA due to high spice (${sanitized.spiceRating})`,
      );
      sanitized.ageLevel = 'NA';
    }

    // Validate tropes - must be from approved list and max 4
    if (Array.isArray(data.tropes) && data.tropes.length > 0) {
      const validTropes = data.tropes
        .filter((t: any) => isValidTrope(t))
        .slice(0, 4);
      sanitized.tropes = validTropes.length > 0 ? validTropes : [];

      // Log any invalid tropes that were filtered
      const invalidCount = data.tropes.length - validTropes.length;
      if (invalidCount > 0) {
        this.logger.warn(
          `Filtered out ${invalidCount} invalid tropes from AI response`,
        );
      }
    } else {
      sanitized.tropes = [];
    }

    // Validate creatures - max 3
    if (Array.isArray(data.creatures) && data.creatures.length > 0) {
      sanitized.creatures = data.creatures
        .filter((c: any) => typeof c === 'string' && c.trim().length > 0)
        .slice(0, 3);
    } else {
      sanitized.creatures = [];
    }

    // Validate subgenres - max 3
    if (Array.isArray(data.subgenres) && data.subgenres.length > 0) {
      sanitized.subgenres = data.subgenres
        .filter((s: any) => typeof s === 'string' && s.trim().length > 0)
        .slice(0, 3);
    } else {
      sanitized.subgenres = [];
    }

    // Preserve series info and validate
    if (data.series && typeof data.series === 'object') {
      sanitized.series = {
        name: data.series.name || null,
        index:
          typeof data.series.index === 'number' ? data.series.index : null,
        total: typeof data.series.total === 'number' ? data.series.total : null,
        status:
          data.series.status &&
          ['COMPLETE', 'INCOMPLETE'].includes(data.series.status)
            ? data.series.status
            : 'UNKNOWN',
      };
    }

    return sanitized;
  }
}
