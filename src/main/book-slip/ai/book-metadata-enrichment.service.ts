import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  BookMetadataEnrichmentResponse,
  EnrichBookRequest,
} from './dto/book-metadata-enrichment.dto.js';

@Injectable()
export class BookMetadataEnrichmentService {
  private readonly logger = new Logger(BookMetadataEnrichmentService.name);
  private openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_KEY is missing');
    }
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * System prompt implementing client specification exactly
   */
  private getSystemPrompt(): string {
    return `You are Spicebound's book metadata enrichment engine, specializing in analyzing books with particular expertise in fantasy romance ("romantasy") and romance genres. Your purpose is to extract and infer detailed metadata that helps readers quickly understand a book's content, tone, and romantic elements.

CRITICAL RULES - FOLLOW EXACTLY:
1. Return ONLY valid JSON. No markdown, no explanatory text, no preamble, no trailing comments.
2. Be accurate over generous—if uncertain, lean conservative (lower spice rating, fewer tropes, MEDIUM or LOW confidence).
3. Analyze ALL book genres, not just romance. Non-romance books still get appropriate age levels and metadata.
4. Base analysis on actual content and reputation, not assumptions.
5. Never fabricate. Use null or "UNKNOWN" if uncertain about series/status.
6. Avoid redundancy—each item must add distinct information.

AGE LEVEL (select exactly ONE):
- CHILDRENS (8-12): No romance beyond innocent crushes
- YA (13-17): Teen protagonists, fade-to-black or NO sexual content
- NA (18-25): College-age, explicit content possible
- ADULT (25+): Mature protagonists, explicit content possible
- EROTICA (adults): Sexual content is PRIMARY focus
RULE: YA cannot have explicit sexual scenes. Explicit = minimum NA.

SPICE RATING (0-6 integer):
0=None | 1=Cute | 2=Sweet | 3=Warm | 4=Spicy | 5=Hot Spicy | 6=Explicit/Kink
RULE: Spice 4+ requires NA/ADULT/EROTICA. No romance = spice 0.

TROPES (max 4, use EXACTLY these strings):
"Enemies to Lovers" | "Friends to Lovers" | "Forbidden Love" | "Slow Burn" | "Instalove"
"Forced Proximity" | "Fake Relationship" | "Marriage of Convenience" | "Arranged Marriage" | "Captive/Captor" | "Trials"
"Grumpy x Sunshine" | "Morally Grey" | "Touch Her and Die" | "Mutual Pining" | "Angst with a Happy Ending" | "Alphahole"
"Fated Mates" | "Chosen One" | "Magic-Bonded Pair" | "Soulmates" | "Power Imbalance" | "Hidden Identity" | "Secret Royalty" | "Villain Gets the Girl" | "Dark Savior" | "Reincarnation"
"Found Family" | "Ragtag Group on a Quest"
"LGBTQ+" | "Love Triangle" | "Reverse Harem"
"Age Gap" | "Teacher x Student"

CREATURES (max 3, empty array if none):
Dragons, Fae, Elves, Dwarves, Orcs, Trolls, Giants, Goblins, Werewolves, Shifters, Skinwalkers, Vampires, Ghosts, Zombies, Reapers, Wraiths, Angels, Demons, Gods/Goddesses, Demigods, Fallen Angels, Witches, Wizards, Elementals, Nymphs, Dryads, Mermaids/Mermen, Sirens, Selkies, Sea Monsters, Phoenixes, Griffins, Centaurs, Minotaurs, Krakens, Valkyries, Djinn/Genies, Kitsune, Gargoyles, Aliens, Cyborgs, Monsters
Special: "Unknown" (unique), "Various" (multiple, none central)

SUBGENRES (max 3, use EXACTLY these):
Romance: Romantasy, Paranormal Romance, Vampire Romance, Werewolf & Shifter Romance, Fae Romance, Dragon Romance, Alien Romance, Dark Romance, Mafia Romance, Gothic Romance, Historical Romance, Regency Romance, Contemporary Romance, Romantic Comedy, Romantic Suspense, Sports Romance, Small Town Romance, Holiday Romance, Billionaire Romance, Military Romance, Reverse Harem Romance, Enemies to Lovers Romance, Action & Adventure Romance, Sci-Fi Romance, Time Travel Romance, Steampunk Romance
Fantasy: Epic Fantasy, High Fantasy, Dark Fantasy, Urban Fantasy, Cozy Fantasy, Sword & Sorcery, Grimdark, Mythic Fantasy, Fairy Tale Retelling, Portal Fantasy, Gaslamp Fantasy, Military Fantasy, Court Intrigue, Magical Realism
Horror: Dark Fantasy Horror, Gothic Fiction, Paranormal Horror, Supernatural Thriller, Monster Horror
Erotica: Fantasy Erotica, Paranormal Erotica, Vampire Erotica, Monster Erotica, Dark Erotica, BDSM Erotica, Sci-Fi Erotica
Sci-Fi: Space Opera, Dystopian, Post-Apocalyptic, Cyberpunk, Military Sci-Fi, First Contact
Other: Thriller, Mystery, Suspense, Action & Adventure, Literary Fiction, Historical Fiction, Contemporary Fiction, Women's Fiction, Coming of Age, Young Adult Fiction, Middle Grade, Memoir, Self-Help, Biography, True Crime, Non-Fiction

SERIES object:
- name: Series name or null
- position: Book number or null
- totalBooks: Total books or null (use null if unknown)
- status: "COMPLETE" (all published) | "INCOMPLETE" (unreleased exist) | "UNKNOWN" (cannot determine)

DESCRIPTION: 3-5 sentences on plot/characters/premise. Awards/bestseller info AFTER two line breaks.

CONFIDENCE: spiceRating and overall as HIGH/MEDIUM/LOW.

Return ONLY valid JSON.`;
  }

  /**
   * Enrich book metadata using OpenAI GPT-4
   */
  async enrichBookMetadata(
    request: EnrichBookRequest,
  ): Promise<BookMetadataEnrichmentResponse> {
    if (!request.title || !request.author) {
      throw new BadRequestException('Title and author are required');
    }

    const userPrompt = this.buildUserPrompt(request);

    try {
      this.logger.log(`Analyzing: ${request.title} by ${request.author}`);

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(),
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content from OpenAI');
      }

      const enrichedMetadata = this.parseJsonResponse(content);
      this.logger.log(`✅ Analyzed: ${request.title}`);

      return enrichedMetadata;
    } catch (error) {
      this.logger.error(
        `Failed to enrich: ${request.title}`,
        error instanceof Error ? error.message : String(error),
      );
      throw new BadRequestException(
        `Failed to analyze book: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Build user prompt from book request - implements client template
   */
  private buildUserPrompt(request: EnrichBookRequest): string {
    return `Analyze this book and return enriched metadata as valid JSON.

## BOOK INFORMATION
- Title: ${request.title}
- Author: ${request.author}
- Published Year: ${request.publishedYear ?? 'Unknown'}
- Description: ${request.description ?? 'Not provided'}
- Categories/Subjects: ${request.categories?.join(', ') ?? 'Not provided'}
- Page Count: ${request.pageCount ?? 'Unknown'}
- Series Info (if known): ${request.seriesInfo ?? 'Unknown'}

---

## ANALYSIS INSTRUCTIONS
Analyze across all dimensions: Age level (based on actual content maturity and target audience), spice rating (0-6 integer scale), tropes (3-4 max, approved list only), creatures (max 3, central to story), subgenres (max 3, specific and non-redundant), series (name, position, totalBooks, status—use null or UNKNOWN if uncertain).

For description: Lead with 3-5 sentences capturing essential plot, main characters, and premise. Only add awards/bestseller/author accolades AFTER two line breaks.

For confidence: Rate spiceRating and overall as HIGH, MEDIUM, or LOW. Default to MEDIUM or LOW if lacking definitive information.

Return ONLY valid JSON, no other text.`;
  }

  /**
   * Parse and validate JSON response - strict compliance with spec
   */
  private parseJsonResponse(content: string): BookMetadataEnrichmentResponse {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!parsed.ageLevel) throw new Error('Missing ageLevel');
      if (parsed.spiceRating === undefined || parsed.spiceRating === null)
        throw new Error('Missing spiceRating');
      if (!Array.isArray(parsed.tropes))
        throw new Error('Invalid tropes: must be array');
      if (!Array.isArray(parsed.creatures))
        throw new Error('Invalid creatures: must be array');
      if (!Array.isArray(parsed.subgenres))
        throw new Error('Invalid subgenres: must be array');
      if (!parsed.series) throw new Error('Missing series object');
      if (!parsed.description) throw new Error('Missing description');
      if (!parsed.confidence) throw new Error('Missing confidence object');

      // Validate age level
      const validAgeLevels = ['CHILDRENS', 'YA', 'NA', 'ADULT', 'EROTICA'];
      if (!validAgeLevels.includes(parsed.ageLevel)) {
        throw new Error(
          `Invalid ageLevel: "${parsed.ageLevel}". Must be: ${validAgeLevels.join(', ')}`,
        );
      }

      // Validate spice rating
      if (
        !Number.isInteger(parsed.spiceRating) ||
        parsed.spiceRating < 0 ||
        parsed.spiceRating > 6
      ) {
        throw new Error(
          `Invalid spiceRating: ${parsed.spiceRating}. Must be integer 0-6`,
        );
      }

      // Validate tropes are exact matches
      const approvedTropes = [
        'Enemies to Lovers',
        'Friends to Lovers',
        'Forbidden Love',
        'Slow Burn',
        'Instalove',
        'Forced Proximity',
        'Fake Relationship',
        'Marriage of Convenience',
        'Arranged Marriage',
        'Captive/Captor',
        'Trials',
        'Grumpy x Sunshine',
        'Morally Grey',
        'Touch Her and Die',
        'Mutual Pining',
        'Angst with a Happy Ending',
        'Alphahole',
        'Fated Mates',
        'Chosen One',
        'Magic-Bonded Pair',
        'Soulmates',
        'Power Imbalance',
        'Hidden Identity',
        'Secret Royalty',
        'Villain Gets the Girl',
        'Dark Savior',
        'Reincarnation',
        'Found Family',
        'Ragtag Group on a Quest',
        'LGBTQ+',
        'Love Triangle',
        'Reverse Harem',
        'Age Gap',
        'Teacher x Student',
      ];
      for (const trope of parsed.tropes) {
        if (!approvedTropes.includes(trope)) {
          throw new Error(
            `Invalid trope: "${trope}". Use exact approved string`,
          );
        }
      }
      if (parsed.tropes.length > 4) {
        throw new Error(`Too many tropes (${parsed.tropes.length}). Max is 4`);
      }

      // Validate creatures
      if (parsed.creatures.length > 3) {
        throw new Error(
          `Too many creatures (${parsed.creatures.length}). Max is 3`,
        );
      }

      // Validate subgenres
      if (parsed.subgenres.length > 3) {
        throw new Error(
          `Too many subgenres (${parsed.subgenres.length}). Max is 3`,
        );
      }

      // Validate series object
      if (typeof parsed.series !== 'object' || parsed.series === null) {
        throw new Error('Series must be valid object');
      }
      const validStatuses = ['COMPLETE', 'INCOMPLETE', 'UNKNOWN'];
      if (!validStatuses.includes(parsed.series.status)) {
        throw new Error(
          `Invalid series.status: "${parsed.series.status}". Must be: ${validStatuses.join(', ')}`,
        );
      }
      if (
        parsed.series.position !== null &&
        parsed.series.position !== undefined
      ) {
        if (
          !Number.isInteger(parsed.series.position) ||
          parsed.series.position < 1
        ) {
          throw new Error(`Invalid series.position: ${parsed.series.position}`);
        }
      }
      if (
        parsed.series.totalBooks !== null &&
        parsed.series.totalBooks !== undefined
      ) {
        if (
          !Number.isInteger(parsed.series.totalBooks) ||
          parsed.series.totalBooks < 1
        ) {
          throw new Error(
            `Invalid series.totalBooks: ${parsed.series.totalBooks}`,
          );
        }
      }

      // Validate confidence
      if (!parsed.confidence || typeof parsed.confidence !== 'object') {
        throw new Error('Confidence must be valid object');
      }
      const validConfidence = ['HIGH', 'MEDIUM', 'LOW'];
      if (!validConfidence.includes(parsed.confidence.spiceRating)) {
        throw new Error(
          `Invalid confidence.spiceRating: "${parsed.confidence.spiceRating}"`,
        );
      }
      if (!validConfidence.includes(parsed.confidence.overall)) {
        throw new Error(
          `Invalid confidence.overall: "${parsed.confidence.overall}"`,
        );
      }

      // Validate description
      if (
        typeof parsed.description !== 'string' ||
        parsed.description.trim().length === 0
      ) {
        throw new Error('Description must be non-empty string');
      }

      // Validate YA/Spice constraint
      if (parsed.ageLevel === 'YA' && parsed.spiceRating >= 4) {
        throw new Error(
          'YA books cannot have spice 4+. YA requires fade-to-black',
        );
      }

      this.logger.debug(`✓ Validated: ${parsed.series.name || 'standalone'}`);
      return parsed as BookMetadataEnrichmentResponse;
    } catch (error) {
      this.logger.error(
        'Parse/validation failed',
        error instanceof Error ? error.message : String(error),
      );
      throw new Error(
        `Invalid response: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
