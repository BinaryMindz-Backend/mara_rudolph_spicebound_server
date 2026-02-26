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
  description?: string;
  series?: {
    name?: string;
    index?: number;
    total?: number;
    status?: string;
  };
  arc?: {
    name?: string;
    index?: number;
    total?: number;
    status?: string;
  };
}

@Injectable()
export class AiEnrichmentService {
  private readonly logger = new Logger(AiEnrichmentService.name);

  constructor(private configService: ConfigService) { }

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
        max_tokens: 800,
      };

      // Log the request for debugging
      this.logger.debug(
        `🔹 OpenAI request model=${model} with ${userPrompt.length} chars`,
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

      let enriched;
      try {
        // Strip out any markdown formatting that the LLM might have added
        let cleanContent = content.trim();
        if (cleanContent.startsWith('```json')) {
          cleanContent = cleanContent.replace(/^```json/, '').replace(/```$/, '').trim();
        } else if (cleanContent.startsWith('```')) {
          cleanContent = cleanContent.replace(/^```/, '').replace(/```$/, '').trim();
        }

        enriched = JSON.parse(cleanContent);
        this.logger.log(`✅ AI Enrichment parsed successfully: ${JSON.stringify(enriched)}`);
      } catch (parseError) {
        this.logger.error(
          `❌ Failed to parse AI response as JSON. Response was: ${content.substring(0, 200)}...`,
          parseError instanceof Error ? parseError.message : String(parseError),
        );
        return {
          ageLevel: 'UNKNOWN',
          spiceRating: 0,
          tropes: [],
          creatures: [],
          subgenres: [],
        };
      }

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
    return `You are a specialist book metadata librarian. Your goal is to identify and enrich data for REAL NARRATIVE BOOKS (novels, memoirs, etc.).

SANITY CHECK:
- If the provided title/data refers to a QUIZ, TRIVIA, STUDY GUIDE, SUMMARY, WORKBOOK, or NON-BOOK product, you MUST return the string "NON_BOOK_CONTENT" for the title and null for all other fields.
- We only want real books, not companion guides or fan-made quizzes.

You are also an expert romance book metadata enrichment engine with deep knowledge of popular literature, BookTok, and romance tropes.
Your role is to classify books according to the Spicebound taxonomy.

CRITICAL RULES:
1. USE YOUR PRE-TRAINED KNOWLEDGE of the book. Don't rely solely on the provided description. If you know the book (e.g., "Fourth Wing", "ACOTAR"), accurately reflect its actual spice level, tropes, and series information.
2. Return ONLY valid JSON, no markdown, no explanations, no extra text.
3. All numerical ratings must be integers (0-6 for spice)
4. All arrays must contain strings from the exact approved lists ONLY
5. Do NOT put creatures in the tropes array.

YOUR RESPONSE MUST be valid JSON that can be parsed.`;
  }

  private buildUserPrompt(bookData: any): string {
    return `Analyze this book using both the provided metadata AND your pre-trained knowledge of the book. Return ONLY valid JSON.

BOOK: Title="${bookData.title || 'unknown'}" | Author="${bookData.author || 'unknown'}" | Description="${bookData.description || 'none'}"

SPICE RATING (0-6):
0=No romance, 1=Cute kisses, 2=Sweet fade, 3=Warm descriptive, 4=Spicy explicit, 5=Hot frequent, 6=Erotica

AGE LEVEL (must match rating - if spice>=4 use NA+):
CHILDREN | YA | NA | ADULT | EROTICA | UNKNOWN

TROPES (max 4, must be exact matches):
${APPROVED_TROPES.join(', ')}

CREATURES: Dragons, Fae, Vampires, Shifters, etc. (max 3, [] if none)
SUBGENRES: Romance, Fantasy, Horror, etc. (max 3, [] if none)
SERIES: {name, index, total, status:"COMPLETE"|"INCOMPLETE"} or null
ARC: {name, index, total, status:"COMPLETE"|"INCOMPLETE"} or null (Only if the series is divided into distinct arcs/cycles)

DESCRIPTION (MANDATORY FORMATTING RULES):
Create a reader-friendly description with EXACTLY TWO parts:

**Part 1 - Core Description (FIRST):**
Write 3-5 sentences that capture the essential plot hook, main characters, and romantic/fantasy premise. This MUST be the very first thing in the description.

**Part 2 - Additional Info (AFTER, separated by two newlines):**
Place any of the following at the END, ONLY after two line breaks (\n\n) to create a clear visible paragraph break:
- Award mentions
- Bestseller status
- Author accolades
- Blurbs from other authors
- "First in series" notes
- Comparison titles ("For fans of...")

CRITICAL RULES:
- NEVER start with bestseller info, awards, or author quotes. (Example of what NOT to do: "The first book of the blockbuster Fever series...")
- Focus on STORY and PLOT first, credentials second.
- MANDATORY: Use exactly two newlines (\n\n) between Part 1 and Part 2 to ensure a visible paragraph break. do NOT use a single newline.
- Keep total description under 400 words.
- If the source description is cluttered, extract and reorganize—do NOT just copy it.
- STAY TRUE to the source description but follow the structure above strictly.

JSON ONLY - validate and return:
{
  "ageLevel": "UNKNOWN|CHILDREN|YA|NA|ADULT|EROTICA",
  "spiceRating": 0-6,
  "tropes": ["approved", "tropes"],
  "creatures": ["type"],
  "subgenres": ["genre"],
  "description": "The formatted description following the rules above.",
  "series": {"name": "Series Name", "index": 1, "total": 5, "status": "INCOMPLETE"} | null,
  "arc": {"name": "Arc Name", "index": 1, "total": 2, "status": "COMPLETE"} | null
}
`;
  }

  private sanitizeEnrichedData(data: any): EnrichedBookData {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid AI response format');
    }

    if (data.title === 'NON_BOOK_CONTENT') {
      throw new Error('NON_BOOK_CONTENT');
    }

    const sanitized: EnrichedBookData = {
      description: typeof data.description === 'string' ? data.description.trim() : undefined,
    };

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

    // Preserve arc info and validate
    if (data.arc && typeof data.arc === 'object') {
      sanitized.arc = {
        name: data.arc.name || null,
        index:
          typeof data.arc.index === 'number' ? data.arc.index : null,
        total: typeof data.arc.total === 'number' ? data.arc.total : null,
        status:
          data.arc.status &&
            ['COMPLETE', 'INCOMPLETE'].includes(data.arc.status)
            ? data.arc.status
            : 'UNKNOWN',
      };
    }

    return sanitized;
  }
}
