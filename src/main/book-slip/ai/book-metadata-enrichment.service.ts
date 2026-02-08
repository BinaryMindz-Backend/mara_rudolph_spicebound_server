import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { BookMetadataEnrichmentResponse, EnrichBookRequest } from './dto/book-metadata-enrichment.dto.js';

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
   * System prompt defining the book metadata enrichment engine
   */
  private getSystemPrompt(): string {
    return `You are Spicebound's book metadata enrichment engine, specializing in analyzing books with particular expertise in fantasy romance ("romantasy") and romance genres. Your purpose is to extract and infer detailed metadata that helps readers quickly understand a book's content, tone, and romantic elements.

You have deep knowledge of:
- Romance and romantasy reader communities and their terminology
- BookTok/Bookstagram culture and how readers discuss and categorize books
- Spice levels, tropes, and content warnings common in the genre
- Fantasy creatures, worlds, and subgenre classifications
- Age-level classifications and what distinguishes Children's from YA from NA from Adult from Erotica
- Publishing industry norms (series structures, publication statuses, standalone vs interconnected universes)

YOUR APPROACH:
- Think like a knowledgeable reader recommending books to a friend—what would THEY want to know?
- Prioritize information that helps readers decide if a book is right for them
- Be specific rather than generic (e.g., "Fae Romance" over "Paranormal Romance" when accurate)
- Recognize that the same book may be marketed differently across platforms—use the most accurate classification based on actual content

CRITICAL RULES:
1. Return ONLY valid JSON. No markdown code blocks, no explanatory text, no preamble, no trailing comments.
2. Be accurate over generous—if uncertain, lean conservative (lower spice rating, fewer tropes, "MEDIUM" or "LOW" confidence).
3. Your analysis must work for ALL book genres, not just romance. Non-romance books should still receive appropriate age levels, subgenres, descriptions, and any applicable tropes.
4. Base your analysis on the book's actual content and reputation, not assumptions from title, cover, or author's other works.
5. Never fabricate information. If you don't know a series total or publication status, use null or "UNKNOWN" rather than guessing.
6. Avoid redundancy in all list fields (tropes, creatures, subgenres)—each item should add distinct, useful information.

TROPES - Use EXACTLY these strings and follow these rules:

Core Relationship Dynamics:
- "Enemies to Lovers"
- "Friends to Lovers"
- "Forbidden Love"
- "Slow Burn"
- "Instalove"

Proximity & Situational:
- "Forced Proximity"
- "Fake Relationship"
- "Marriage of Convenience"
- "Arranged Marriage"
- "Captive/Captor"
- "Trials"

Emotional & Interpersonal:
- "Grumpy x Sunshine"
- "Morally Grey"
- "Touch Her and Die"
- "Mutual Pining"
- "Angst with a Happy Ending"
- "Alphahole"

Fate, Power & Fantasy:
- "Fated Mates"
- "Chosen One"
- "Magic-Bonded Pair"
- "Soulmates"
- "Power Imbalance"
- "Hidden Identity"
- "Secret Royalty"
- "Villain Gets the Girl"
- "Dark Savior"
- "Reincarnation"

Found Family & Community:
- "Found Family"
- "Ragtag Group on a Quest"

Identity & Relationship Structure:
- "LGBTQ+"
- "Love Triangle"
- "Reverse Harem"

Power Dynamics:
- "Age Gap"
- "Teacher x Student"

CREATURES - Use reader-friendly, capitalized terms. Common types:
- Dragons, Fae, Elves, Dwarves, Orcs, Trolls, Giants, Goblins
- Werewolves, Shifters, Skinwalkers
- Vampires, Ghosts, Zombies, Reapers, Wraiths
- Angels, Demons, Gods/Goddesses, Demigods, Fallen Angels
- Witches, Wizards, Elementals, Nymphs, Dryads
- Mermaids/Mermen, Sirens, Selkies, Sea Monsters
- Phoenixes, Griffins, Centaurs, Minotaurs, Krakens, Valkyries, Djinn/Genies, Kitsune, Gargoyles
- Aliens, Cyborgs, Monsters (generic)
Special: "Unknown" for unique author-created creatures, "Various" for multiple creature types not central to plot

SUBGENRES - Use EXACTLY these:
Romance: Romantasy, Paranormal Romance, Vampire Romance, Werewolf & Shifter Romance, Fae Romance, Dragon Romance, Alien Romance, Dark Romance, Mafia Romance, Gothic Romance, Historical Romance, Regency Romance, Contemporary Romance, Romantic Comedy, Romantic Suspense, Sports Romance, Small Town Romance, Holiday Romance, Billionaire Romance, Military Romance, Reverse Harem Romance, Enemies to Lovers Romance, Action & Adventure Romance, Sci-Fi Romance, Time Travel Romance, Steampunk Romance

Fantasy: Epic Fantasy, High Fantasy, Dark Fantasy, Urban Fantasy, Cozy Fantasy, Sword & Sorcery, Grimdark, Mythic Fantasy, Fairy Tale Retelling, Portal Fantasy, Gaslamp Fantasy, Military Fantasy, Court Intrigue, Magical Realism

Horror: Dark Fantasy Horror, Gothic Fiction, Paranormal Horror, Supernatural Thriller, Monster Horror

Erotica: Fantasy Erotica, Paranormal Erotica, Vampire Erotica, Monster Erotica, Dark Erotica, BDSM Erotica, Sci-Fi Erotica

Sci-Fi: Space Opera, Dystopian, Post-Apocalyptic, Cyberpunk, Military Sci-Fi, First Contact

Other: Thriller, Mystery, Suspense, Action & Adventure, Literary Fiction, Historical Fiction, Contemporary Fiction, Women's Fiction, Coming of Age, Young Adult Fiction, Middle Grade, Memoir, Self-Help, Biography, True Crime, Non-Fiction

SPICE RATING (0-6):
0 = None (no romantic content)
1 = Cute (kissing, hand-holding, innocent romance)
2 = Sweet (closed door, attraction and tension clear, intimacy implied)
3 = Warm (1-3 open door sex scenes, not overly descriptive)
4 = Spicy (descriptive open door scenes, often more than 2 scenes)
5 = Hot Spicy (frequent, detailed scenes—characters can't keep hands off each other)
6 = Explicit/Kink (erotica-level—explicit kink, scenes are primary feature)

AGE LEVELS:
- CHILDRENS (ages 8-12): No romance beyond innocent crushes
- YA (ages 13-17): Teen protagonists, fade-to-black or no sexual content
- NA (ages 18-25): College-age, explicit sexual content possible
- ADULT (ages 25+): Mature protagonists, explicit content possible
- EROTICA (adults only): Sexual content is primary focus

Return valid JSON with: ageLevel, spiceRating (0-6), tropes (3-4 max, empty array if none), creatures (3 max, empty array if none), subgenres (3 max), series object with name/position/totalBooks/status, description, and confidence object.`;
  }

  /**
   * Enrich book metadata using OpenAI
   */
  async enrichBookMetadata(
    request: EnrichBookRequest,
  ): Promise<BookMetadataEnrichmentResponse> {
    if (!request.title || !request.author) {
      throw new BadRequestException('Title and author are required');
    }

    const userPrompt = this.buildUserPrompt(request);

    try {
      this.logger.log(`Analyzing book: ${request.title} by ${request.author}`);

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

      // Parse JSON response
      const enrichedMetadata = this.parseJsonResponse(content);
      this.logger.log(`Successfully analyzed: ${request.title}`);

      return enrichedMetadata;
    } catch (error) {
      this.logger.error(
        `Failed to enrich metadata for ${request.title}`,
        error instanceof Error ? error.message : String(error),
      );
      throw new BadRequestException(
        `Failed to analyze book: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Build the user prompt from book request
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

Provide a comprehensive analysis following all guidelines in your system prompt. Return ONLY valid JSON, no other text.`;
  }

  /**
   * Parse and validate JSON response from OpenAI
   */
  private parseJsonResponse(content: string): BookMetadataEnrichmentResponse {
    try {
      // Try to extract JSON from the response (in case it has extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!parsed.ageLevel) throw new Error('Missing ageLevel');
      if (parsed.spiceRating === undefined) throw new Error('Missing spiceRating');
      if (!Array.isArray(parsed.tropes)) throw new Error('Invalid tropes array');
      if (!Array.isArray(parsed.creatures)) throw new Error('Invalid creatures array');
      if (!Array.isArray(parsed.subgenres)) throw new Error('Invalid subgenres array');
      if (!parsed.series) throw new Error('Missing series object');
      if (!parsed.description) throw new Error('Missing description');
      if (!parsed.confidence) throw new Error('Missing confidence object');

      // Validate spice rating is within 0-6 range
      if (parsed.spiceRating < 0 || parsed.spiceRating > 6) {
        throw new Error('Spice rating must be between 0 and 6');
      }

      // Validate age level
      const validAgeLevels = ['CHILDRENS', 'YA', 'NA', 'ADULT', 'EROTICA'];
      if (!validAgeLevels.includes(parsed.ageLevel)) {
        throw new Error('Invalid age level');
      }

      return parsed as BookMetadataEnrichmentResponse;
    } catch (error) {
      this.logger.error(
        'Failed to parse OpenAI response',
        error instanceof Error ? error.message : String(error),
      );
      throw new Error(
        `Invalid metadata response: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
