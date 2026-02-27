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
    name?: string | null;
    position?: number | null;
    totalBooks?: number | null;
    status?: string;
    isMultiArc?: boolean;
    arc?: {
      arcNumber?: number | null;
      name?: string | null;
      position?: number | null;
      totalBooks?: number | null;
      status?: string;
    } | null;
  } | null;
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

SANITY CHECK (CRITICAL):
- If the provided title/data refers to a QUIZ, TRIVIA, STUDY GUIDE, SUMMARY, WORKBOOK, ANALYSIS, or NON-BOOK product, you MUST return the string "NON_BOOK_CONTENT" for the title and null for all other fields.
- We ONLY want real narrative books, not companion guides, fan-made quizzes, or summaries.
- Examples of NON-BOOK items: "How Well Do You Know...", "Trivia for...", "Summary of...", "Workbook: [Book Title]".

You are also an expert romance book metadata enrichment engine with deep knowledge of popular literature, BookTok, and romance tropes.
Your role is to classify books according to the Spicebound taxonomy.

CRITICAL RULES:
1. USE YOUR PRE-TRAINED KNOWLEDGE of the book. Don't rely solely on the provided description. If you know the book (e.g., "Fourth Wing", "ACOTAR"), accurately reflect its actual spice level, tropes, and series information.
2. Return ONLY valid JSON, no markdown, no explanations, no extra text.
3. All numerical ratings must be integers (0-6 for spice)
4. All arrays must contain strings from the exact approved lists ONLY
5. Do NOT put creatures in the tropes array.

YOUR RESPONSE MUST be valid JSON that can be parsed.

MANDATORY KNOWLEDGE (MUST FOLLOW):
- "The Serpent and the Wings of Night" by Carissa Broadbent is a MULTI-ARC series in the "Crowns of Nyaxia" universe. It is the first book of the "Nightborn Duet".
- "Ice Planet Barbarians" by Ruby Dixon is a series with 22+ books.
- "The Love Hypothesis" by Ali Hazelwood is a STANDALONE.
- "Fourth Wing" by Rebecca Yarros: Part of the "The Empyrean" series. 5 books are planned in total. Status is INCOMPLETE.
- "Fever Series" by Karen Marie Moning (starts with "Darkfever"): The main series (books 1-11) is COMPLETE. All books in this series should have status "COMPLETE".
- "Speak of the Demon" by Stacia Stark: Part of the "Dealing with Demons" series. This is a 6-book series. Status is COMPLETE.

SERIES INFORMATION:
Provide series details if applicable using the structure below.
"series": {
  "name": "Series Name",
  "position": 1,
  "totalBooks": 5,
  "status": "INCOMPLETE",
  "isMultiArc": true,
  "arc": {
    "arcNumber": 1,
    "name": "Arc Name",
    "position": 1,
    "totalBooks": 2,
    "status": "COMPLETE"
  }
} (or null if no series connection)

SERIES CLASSIFICATION RULES:
- **CONSISTENCY**: All books in the same series MUST have the same name, overall status, and totalBooks count.
- **COMPLETE**: Use ONLY if ALL planned books are released. (Fever series is COMPLETE; Empyrean is INCOMPLETE).
- **TOTAL BOOKS**: Reflect the full planned series count (e.g. Fourth Wing/Empyrean = 5; Speak of the Demon/Dealing with Demons = 6).
- **SERIES OVER STANDALONE**: Known series books must NOT be marked standalone.
`;
  }

  private buildUserPrompt(bookData: any): string {
    return `Analyze this book using both the provided metadata AND your pre-trained knowledge of the book. Return ONLY valid JSON.

BOOK: Title="${bookData.title || 'unknown'}" | Author="${bookData.author || 'unknown'}" | Description="${bookData.description || 'none'}"

SPICE RATING (0-6):
0=No romance, 1=Cute kisses, 2=Sweet fade, 3=Warm descriptive, 4=Spicy explicit, 5=Hot frequent, 6=Erotica

AGE LEVEL (must match rating - if spice>=4 use NA+):
CHILDREN | YA | NA | ADULT | EROTICA | UNKNOWN

3. TROPES (max 4, must be EXACT matches):
Choose 3-4 tropes that BEST define the book's core dynamics, emotional themes, and narrative elements.

PRIORITIZE IN THIS ORDER:
1. Primary relationship dynamic (e.g., Enemies to Lovers, Friends to Lovers)
2. Situational setup (e.g., Forced Proximity, Arranged Marriage)
3. Emotional/tonal themes (e.g., Slow Burn, Angst with a Happy Ending, Morally Grey)
4. Fantasy-specific or structural elements (e.g., Fated Mates, Chosen One, Found Family)

APPROVED TROPES (use EXACTLY these strings):
${APPROVED_TROPES.join(', ')}

TROPE RULES:
1. **Return 3-4 tropes maximum** (or 0 if truly none apply). Quality over quantity.
2. **Apply to ALL books, not just romance** (e.g. "Chosen One", "Found Family", "Morally Grey" are genre-neutral).
3. **Only return an empty array [] if NO tropes apply at all** (rare for fiction).
4. **Use EXACT strings from the list**. Do not paraphrase.
5. **Avoid Redundancy**: Do NOT list tropes that convey the same dynamic (e.g. choose ONE of "Soulmates" vs "Fated Mates").

TROPE CLARIFICATIONS:
- "Enemies to Lovers" vs "Hate to Love": Enemies = external/situational adversaries; Hate = personal/interpersonal animosity.
- "Fated Mates" vs "Soulmates": Fated Mates = explicit fantasy/biological bonds; Soulmates = destined love without fantasy mechanics.
- "Marriage of Convenience" vs "Arranged Marriage": Convenience = characters choose; Arranged = external party (family/kingdom) chooses.
- "Hidden Identity" vs "Secret Royalty": Hidden Identity = concealed essence/job; Secret Royalty = concealed noble status.
- "Reverse Harem" is also referred to as "Why Choose".

CREATURES: Dragons, Fae, Vampires, Shifters, etc. (max 3, [] if none)
SUBGENRES (Max 3): Classify the book's genre/subgenre. Be specific and accurate.

ROMANCE & ROMANTASY: "Romantasy", "Paranormal Romance", "Vampire Romance", "Werewolf & Shifter Romance", "Fae Romance", "Dragon Romance", "Alien Romance", "Dark Romance", "Mafia Romance", "Gothic Romance", "Historical Romance", "Regency Romance", "Contemporary Romance", "Romantic Comedy", "Romantic Suspense", "Sports Romance", "Small Town Romance", "Holiday Romance", "Billionaire Romance", "Military Romance", "Reverse Harem Romance", "Enemies to Lovers Romance", "Action & Adventure Romance", "Sci-Fi Romance", "Time Travel Romance", "Steampunk Romance"
FANTASY: "Epic Fantasy", "High Fantasy", "Dark Fantasy", "Urban Fantasy", "Cozy Fantasy", "Sword & Sorcery", "Grimdark", "Mythic Fantasy", "Fairy Tale Retelling", "Portal Fantasy", "Gaslamp Fantasy", "Military Fantasy", "Court Intrigue", "Magical Realism"
HORROR & GOTHIC: "Dark Fantasy Horror", "Gothic Fiction", "Paranormal Horror", "Supernatural Thriller", "Monster Horror"
EROTICA: "Fantasy Erotica", "Paranormal Erotica", "Vampire Erotica", "Monster Erotica", "Dark Erotica", "BDSM Erotica", "Sci-Fi Erotica"
SCIENCE FICTION: "Space Opera", "Dystopian", "Post-Apocalyptic", "Cyberpunk", "Military Sci-Fi", "First Contact"
OTHER: "Thriller", "Mystery", "Suspense", "Action & Adventure", "Literary Fiction", "Historical Fiction", "Contemporary Fiction", "Women's Fiction", "Coming of Age", "Young Adult Fiction", "Middle Grade"
NON-FICTION: "Memoir", "Self-Help", "Biography", "True Crime", "Non-Fiction"

GENRE SELECTION RULES:
1. **MOST SPECIFIC FIRST**: If it's a vampire romance -> use "Vampire Romance" not just "Paranormal Romance".
2. **ROMANCE LABELING**: The first subgenre should establish if it's romance (e.g. "Vampire Romance"); others add flavor (e.g. "Dark Fantasy", "Gothic Fiction"). Don't repeat "Romance" in every tag.
3. **AVOID REDUNDANCY**: Do NOT use synonyms or duplicates. "Romantasy" and "Fantasy Romance" are the same—use "Romantasy".
4. **LAYERING**: Type (Romance/Genre) -> Setting/Tone -> Themes.
5. **NON-ROMANCE**: Lead with the primary genre (e.g. ["Epic Fantasy", "Grimdark"]).

SERIES INFORMATION:
Provide series details if applicable using the structure below.
"series": {
  "name": "Series Name",
  "position": 1,
  "totalBooks": 5,
  "status": "INCOMPLETE",
  "isMultiArc": true,
  "arc": {
    "arcNumber": 1,
    "name": "Arc Name",
    "position": 1,
    "totalBooks": 2,
    "status": "COMPLETE"
  }
} (or null if no series connection)

SERIES CLASSIFICATION RULES:
- **CONSISTENCY**: All books in the same series MUST have the same name, overall status, and totalBooks count.
- **COMPLETE**: Use ONLY if ALL planned books are released. (Fever series is COMPLETE; Empyrean is INCOMPLETE).
- **TOTAL BOOKS**: Reflect the full planned series count (e.g. Fourth Wing/Empyrean = 5; Speak of the Demon/Dealing with Demons = 6).
- **SERIES OVER STANDALONE**: Known series books must NOT be marked standalone.

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

JSON Structure & Examples:
1. "Ice Planet Barbarians": { "series": { "name": "Ice Planet Barbarians", "position": 1, "totalBooks": 22, "status": "COMPLETE", "isMultiArc": false, "arc": null }, "tropes": ["Science Fiction Romance", "Fated Mates", "Forced Proximity"] }
2. "Fourth Wing": { "series": { "name": "The Empyrean", "position": 1, "totalBooks": 5, "status": "INCOMPLETE", "isMultiArc": false, "arc": null }, "tropes": ["Enemies to Lovers", "Forced Proximity", "Dragon Romance", "Morally Grey"] }
3. "The Serpent and the Wings of Night": { "series": { "name": "Crowns of Nyaxia", "position": 1, "totalBooks": 6, "status": "INCOMPLETE", "isMultiArc": true, "arc": { "arcNumber": 1, "name": "The Nightborn Duet", "position": 1, "totalBooks": 2, "status": "COMPLETE" } } }
4. "Darkfever": { "series": { "name": "Fever Series", "position": 1, "totalBooks": 11, "status": "COMPLETE", "isMultiArc": false, "arc": null } }
5. "Speak of the Demon": { "series": { "name": "Dealing with Demons", "position": 1, "totalBooks": 6, "status": "COMPLETE", "isMultiArc": false, "arc": null } }

JSON ONLY - validate and return:
{
  "ageLevel": "UNKNOWN|CHILDREN|YA|NA|ADULT|EROTICA",
  "spiceRating": 0-6,
  "tropes": ["approved", "tropes"],
  "creatures": ["type"],
  "subgenres": ["genre"],
  "description": "The formatted description...",
  "series": { ... }
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

    // Preserve series and arc info and validate
    if (data.series && typeof data.series === 'object') {
      const s = data.series;
      sanitized.series = {
        name: s.name || null,
        position: typeof s.position === 'number' ? s.position : 1,
        totalBooks: typeof s.totalBooks === 'number' ? s.totalBooks : null,
        status: ['COMPLETE', 'INCOMPLETE', 'UNKNOWN'].includes(s.status) ? s.status : 'UNKNOWN',
        isMultiArc: !!s.isMultiArc,
        arc: null,
      };

      if (s.isMultiArc && s.arc && typeof s.arc === 'object') {
        const a = s.arc;
        sanitized.series.arc = {
          arcNumber: typeof a.arcNumber === 'number' ? a.arcNumber : null,
          name: a.name || null,
          position: typeof a.position === 'number' ? a.position : null,
          totalBooks: typeof a.totalBooks === 'number' ? a.totalBooks : null,
          status: ['COMPLETE', 'INCOMPLETE', 'UNKNOWN'].includes(a.status) ? a.status : 'UNKNOWN',
        };
      }
    }

    return sanitized;
  }
}
