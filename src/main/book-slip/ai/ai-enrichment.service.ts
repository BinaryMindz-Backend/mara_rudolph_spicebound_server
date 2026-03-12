import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isValidTrope,
  APPROVED_TROPES,
} from '../../../common/constants/tropes.js';

export interface EnrichedBookData {
  title?: string;
  author?: string;
  ageLevel?: string;
  spiceCategory?: string;
  spiceRating?: number;
  spiceIncreasesInSeries?: boolean;
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
  amazonAsin?: string;
  confidence?: {
    spiceRating?: string;
    overall?: string;
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
          spiceCategory: 'No Spice',
          spiceRating: 0,
          spiceIncreasesInSeries: false,
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
        temperature: 0.2, // Low temperature for consistent, factual responses
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
          spiceCategory: 'No Spice',
          spiceRating: 0,
          spiceIncreasesInSeries: false,
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
          spiceCategory: 'No Spice',
          spiceRating: 0,
          spiceIncreasesInSeries: false,
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
          cleanContent = cleanContent
            .replace(/^```json/, '')
            .replace(/```$/, '')
            .trim();
        } else if (cleanContent.startsWith('```')) {
          cleanContent = cleanContent
            .replace(/^```/, '')
            .replace(/```$/, '')
            .trim();
        }

        enriched = JSON.parse(cleanContent);
        this.logger.log(
          `✅ AI Enrichment parsed successfully: ${JSON.stringify(enriched)}`,
        );
      } catch (parseError) {
        this.logger.error(
          `❌ Failed to parse AI response as JSON. Response was: ${content.substring(0, 200)}...`,
          parseError instanceof Error ? parseError.message : String(parseError),
        );
        return {
          ageLevel: 'UNKNOWN',
          spiceCategory: 'No Spice',
          spiceRating: 0,
          spiceIncreasesInSeries: false,
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
        spiceCategory: 'No Spice',
        spiceRating: 0,
        spiceIncreasesInSeries: false,
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

CRITICAL RULES:
1. USE YOUR PRE-TRAINED KNOWLEDGE of the book. Don't rely solely on the provided description. If you know the book, accurately reflect its actual spice level, tropes, and series information.
2. Return ONLY valid JSON, no markdown, no explanations, no extra text.
3. All numerical ratings must be integers (0-6 for spice)
4. All arrays must contain strings from the exact approved lists ONLY
5. Do NOT put creatures in the tropes array.
6. **AMAZON ASIN**: Use your knowledge to provide the **Amazon ASIN** (e.g., B09B7XVLJG) for the primary paperback or Kindle edition of the book.

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
    const hasAmazonContext = bookData.amazonAsin && bookData.titleFromUrl;
    const amazonBlock = hasAmazonContext
      ? `
**AMAZON LINK CONTEXT (PRIORITY):** The user looked up this book by pasting an Amazon product URL.
- Amazon ASIN: ${bookData.amazonAsin}
- Title/slug from the URL: "${bookData.titleFromUrl}"

The Title/Author/Description below may be from a DIFFERENT book (e.g. a collection, box set, or wrong search result). You MUST identify and return metadata for the **exact book at this Amazon ASIN**—the one the user's link points to. Include "title" and "author" in your JSON with the correct book's title and author.

`
      : '';

    const seriesBlock = bookData.seriesContext
      ? `\n**SERIES CONTEXT (Google/OpenLibrary):**\n- Series Name: ${bookData.seriesContext.name || 'Unknown'}\n- Volume/Position: ${bookData.seriesContext.position || 'Unknown'}\n- Total Books: ${bookData.seriesContext.totalBooks || 'Unknown'}\nValidate this before using, and fill in any missing details like status or total counts.\n`
      : '';

    return `Analyze this book using both the provided metadata AND your pre-trained knowledge of the book. Return ONLY valid JSON.
${amazonBlock}${seriesBlock}
BOOK: Title="${bookData.title || 'unknown'}" | Author="${bookData.author || 'unknown'}" | Description="${bookData.description || 'none'}"

### 1. AGE LEVEL
Classify the intended reader age level based on content maturity, themes, and marketing:

| Level | Description | Indicators |
|-------|-------------|------------|
| Childrens | Ages 8-12 | No romance beyond innocent crushes, age-appropriate themes, middle-grade marketing |
| YA | Ages 13-17 | Teen protagonists, first love themes, fade-to-black or no sexual content, coming-of-age focus |
| New Adult | Ages 18-25 | College-age/early 20s protagonists, explicit sexual content possible, identity/independence themes |
| Adult | Ages 25+ | Mature protagonists, complex life situations, explicit content possible, no age-based content restrictions |
| Erotica | Adults only | Sexual content is the primary focus, plot serves the erotic scenes, marketed as erotica/erotic romance |

**Key Distinction:** YA may have intense romance but NO explicit sexual scenes. New Adult and above may include explicit content. If a book has explicit sexual content, it CANNOT be YA.

### 2. SPICE RATING

Spicebound uses a dual spice system: a **primary categorical label** (displayed as the main chip) and a **secondary numeric estimate** (displayed inside the Spice Guide modal). Both must be returned.

#### 2a. SPICE CATEGORY (Primary — displayed as chip)

Assign ONE category that best describes THIS BOOK's spice level:

| Category | Numeric Range | Description | When to Use |
|----------|---------------|-------------|-------------|
| No Spice | 0–1 | No sexual content. May include light romance or kissing. | Books with zero romance, or romance limited to hand-holding/kissing. Most middle grade, many YA, non-romance genres. |
| Closed Door | 2 | AKA clean or fade-to-black. Romantic tension and attraction are clear, but intimacy happens off-page. | Clean romance, sweet romance, most YA romance, books where the "door closes" before anything explicit. |
| Mild Spice | 3 | 1–3 open-door scenes, nothing wild. Descriptive but not the book's focus. | Light-to-medium steam. Romance is present and scenes are open-door, but they're relatively brief or infrequent. |
| Confirmed Spice | 3–4 | Confident spice is present, but exact level is uncertain. | **Low-confidence fallback.** Use when the book clearly has open-door content but you cannot confidently distinguish between Mild and High. This is an honest hedge — never force a Mild or High rating when uncertain. |
| High Spice | 4 | 3+ scenes, more explicit. Frequent, detailed, and a significant part of the reading experience. | High-heat romance and romantasy. Scenes are descriptive, frequent, and integral to the story. Characters have strong physical chemistry throughout. |
| Erotica | 5 | Spice is central with minimal plot. Sexual content is the primary feature. | Erotica and erotic romance where the plot primarily serves the explicit scenes. |

**CRITICAL RULES:**
- **Rate THIS BOOK only.** Do not average across the series. If book 1 has closed-door romance but later books are explicitly spicy, book 1 is still "Closed Door."
- **When uncertain between Mild Spice and High Spice, use "Confirmed Spice."** Do not guess. An honest hedge is always better than a wrong rating.
- **Be conservative.** When in doubt, rate lower rather than higher. A reader who discovers more spice than expected is pleasantly surprised; a reader who finds less than expected feels misled.
- **High Spice and Erotica require NA, ADULT, or EROTICA age level.** If you assign High Spice or Erotica, the age level cannot be YA or CHILDRENS.
- **No romance = "No Spice."** If the book has no romantic subplot whatsoever, the category is always "No Spice."
- **Base this on the book's actual content and reader community consensus,** not assumptions from the title, cover, or the author's other works.

**CATEGORY SELECTION RULES:**
1. Return EXACTLY ONE category string from the approved list above.
2. Use the exact strings: "No Spice", "Closed Door", "Mild Spice", "Confirmed Spice", "High Spice", "Erotica"
3. If confidence in spice assessment is LOW, prefer "Confirmed Spice" (if spice exists) or note it in confidence.spiceRating.

#### 2b. SPICE NUMERIC ESTIMATE (Secondary — displayed in Spice Guide modal)

Also return a numeric spice estimate on a 0–5 scale. This is shown inside the Spice Guide modal as an "Estimated rating" alongside the categorical legend. It is secondary to the category and labeled as an AI estimate.

| Rating | Description |
|--------|-------------|
| 0 | None — no romantic or sexual content |
| 1 | Kissing & light romance |
| 2 | Fade-to-black scenes |
| 3 | Mild spice, 1–3 open-door scenes |
| 4 | Descriptive open-door scenes, frequent |
| 5 | Erotica-forward, minimal plot |

The numeric estimate should be consistent with the category. If the category is "Confirmed Spice," the numeric estimate should be 3 or 4 (your best guess within that range).

#### 2c. SPICE INCREASES IN SERIES (Secondary tag — displayed as separate chip)

Return a boolean indicating whether spice **significantly increases** across the series compared to this book.

Set \`spiceIncreasesInSeries: true\` ONLY when ALL of the following are true:
1. The book is part of a multi-book series (not a standalone).
2. The spice level in later books is meaningfully higher than in this book — enough that a reader could feel misled by this book's rating alone.
3. You have reasonable confidence in this assessment based on the series' reputation.

**Threshold guidance:** A jump from Closed Door → Mild Spice or higher qualifies. A jump from Mild Spice → High Spice qualifies. A subtle increase within the same category (e.g., light 3 to strong 3) does NOT qualify.

**When NOT to apply:**
- The book is a standalone.
- The book is already the spiciest in the series (or close to it).
- The book is already High Spice or higher.
- You are not confident about the spice trajectory of the series.
- The spice increase is minor or subjective.

Set \`spiceIncreasesInSeries: false\` in all other cases. When in doubt, leave it false — a missing tag is fine, a wrong one erodes reader trust.

**Examples:**
- ACOTAR book 1 (Mild Spice) → later books are High Spice → \`true\`
- Fourth Wing book 1 (Confirmed Spice) → book 2 is also Confirmed Spice → \`false\` (no significant increase)
- Ice Planet Barbarians book 1 (High Spice) → subsequent books are also High Spice → \`false\`
- A standalone romance → \`false\` (not a series)

### 3. TROPES (Select 3-4 from approved list)
Choose the tropes that BEST define this book's core dynamics, emotional themes, and narrative elements.

**PRIORITIZE IN THIS ORDER:** 
1. The primary relationship dynamic (e.g., Enemies to Lovers, Friends to Lovers) 
2. The situational setup (e.g., Forced Proximity, Arranged Marriage) 
3. Emotional/tonal themes (e.g., Slow Burn, Angst with a Happy Ending, Morally Grey) 
4. Fantasy-specific or structural elements (e.g., Fated Mates, Chosen One, Found Family)

**APPROVED TROPES LIST** (use EXACTLY these strings):
Core Relationship Dynamics:
- "Enemies to Lovers"
- "Hate to Love"
- "Friends to Lovers"
- "Forbidden Love"
- "Slow Burn"
- "Instalove"
- "Second-Chance Romance"

Proximity & Situational:
- "Forced Proximity"
- "Fake Relationship"
- "Marriage of Convenience"
- "Arranged Marriage"
- "Captive/Captor"
- "Bodyguard/Protector"
- "Trials"

Emotional & Interpersonal:
- "Grumpy x Sunshine"
- "Morally Grey"
- "Morally Black"
- "Touch Her and Die"
- "Mutual Pining"
- "Angst with a Happy Ending"
- "Alphahole"
- "Bully Romance"
- "Redemption Arc"

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
- "Hidden Memories"
- "Curse/Curse Breaking"

Found Family & Community:
- "Found Family"
- "Ragtag Group on a Quest"

Identity & Relationship Structure:
- "LGBTQ+"
- "Love Triangle"
- "Why Choose"
- "Dual POV"

Power Dynamics:
- "Age Gap"
- "Teacher x Student"

---

**RULES:**

1. **Return 3-4 tropes maximum**
   - If fewer than 3 apply confidently, return only what applies (minimum 0)
   - Quality over quantity—don't force tropes that don't fit

2. **Tropes apply to ALL books, not just romance**
   - Many tropes describe story structure, character dynamics, or themes beyond romance
   - Non-romance books can have: "Chosen One", "Found Family", "Ragtag Group on a Quest", "Morally Grey", "Hidden Identity", "Secret Royalty", "Trials", "Reincarnation", "Power Imbalance", "LGBTQ+"
   - Example: *The Hunger Games* (minimal romance) -> ["Chosen One", "Love Triangle", "Found Family"]
   - Example: *Six of Crows* -> ["Found Family", "Ragtag Group on a Quest", "Morally Grey", "Slow Burn"]
   - Example: *The Poppy War* (dark fantasy, minimal romance) -> ["Chosen One", "Morally Grey", "Found Family"]

3. **Only return an empty array [] if NO tropes apply at all**
   - This should be rare—most fiction has some applicable tropes
   - Likely only for non-fiction, memoirs, or highly literary/experimental works

4. **Use EXACT strings from the approved list**
   - Do not paraphrase, abbreviate, or create variations

5. **Avoid Redundancy**
   - Do NOT list tropes that convey essentially the same dynamic
   - "Soulmates" vs "Fated Mates" — pick ONE:
     - Use "Fated Mates" for fantasy with explicit mating bonds, scent recognition, or biological compulsion
     - Use "Soulmates" for destined love without fantasy mate mechanics
   - "Marriage of Convenience" vs "Arranged Marriage" — pick the more accurate one:
     - "Arranged Marriage" = external party (family, kingdom) arranges it
     - "Marriage of Convenience" = characters choose it themselves for practical reasons
   - "Enemies to Lovers" vs "Hate to Love" — pick the more accurate one:
     - "Enemies to Lovers" = adversaries on opposing sides (external conflict)
     - "Hate to Love" = personal animosity without being actual enemies (interpersonal conflict)
     - A book can occasionally have both if characters are true enemies AND personally despise each other, but this is rare—usually one is more dominant
   - Each trope should add DISTINCT information about the story

6. **Trope Clarifications**
   - "Enemies to Lovers" = characters start as genuine adversaries on opposing sides of a conflict (rival kingdoms, warring factions, competing families, hunter vs hunted); their enmity is external/situational
   - "Hate to Love" = characters have intense personal animosity without being true enemies (coworkers who despise each other, personality clashes, past grudges); their conflict is personal/interpersonal, not situational
   - "Second-Chance Romance" = characters who were previously together (exes, lost loves, broken engagements) reunite and rekindle their relationship
   - "Bodyguard/Protector" = one character is formally or informally responsible for protecting the other; the protection dynamic is central to their relationship
   - "Grumpy x Sunshine" = pairing of an optimistic, cheerful character with a brooding, cynical one
   - "Morally Grey" = protagonist OR love interest operates in ethical grey areas, anti-hero vibes, makes questionable choices but isn't purely evil
   - "Morally Black" = protagonist OR love interest is a true villain—dark, unapologetic, no redemption arc; common in dark romance
   - "Touch Her and Die" = possessive/protective love interest who threatens others over the protagonist
   - "Alphahole" = love interest is an alpha-personality jerk (often redeemed); arrogant and domineering but not necessarily cruel
   - "Bully Romance" = love interest actively torments, humiliates, or targets the protagonist (common in dark romance and academy settings); distinct from Alphahole in the sustained cruelty
   - "Redemption Arc" = a morally grey/black character earns their happy ending through growth and changed behavior; signals the "bad" character becomes better
   - "Trials" = characters must pass tests, competitions, or challenges (training academies, magical trials, tournaments)
   - "Dark Savior" = morally dark character rescues/protects the protagonist; the savior is not a hero
   - "Power Imbalance" = significant disparity in power, status, or authority between romantic leads
   - "Hidden Identity" = character conceals who they truly are (secret spy, disguised enemy, hidden species)
   - "Secret Royalty" = character is secretly royal or nobility; their true status is revealed during the story
   - "Hidden Memories" = character has lost, suppressed, or magically erased memories; amnesia plots, memory wipes, forgotten past lives
   - "Curse Breaking" = a curse drives the plot and must be broken; common in fairy tale retellings and romantasy
   - "Why Choose" = protagonist has multiple love interests and does NOT have to choose between them; polyamorous HEA (also known and referred to as "Reverse Harem")
   - "LGBTQ+" = main character or primary romance is queer (use in addition to other tropes, not as the only trope unless nothing else fits)


---

**EXAMPLES:**

*High-romance fantasy:*
Fourth Wing -> ["Enemies to Lovers", "Forced Proximity", "Touch Her and Die", "Morally Grey"]

*Romance-heavy but also adventure:*
ACOTAR -> ["Enemies to Lovers", "Fated Mates", "Trials", "Forced Proximity"]

*Low-romance fantasy:*
The Priory of the Orange Tree -> ["LGBTQ+", "Chosen One", "Found Family"]

*No-romance fantasy:*
The Name of the Wind -> ["Chosen One", "Ragtag Group on a Quest"]

*Non-fantasy romance:*
The Hating Game -> ["Enemies to Lovers", "Forced Proximity", "Grumpy x Sunshine", "Slow Burn"]

*Thriller with romantic subplot:*
The Love Hypothesis -> ["Fake Relationship", "Grumpy x Sunshine", "Slow Burn"]

*Dark romance:*
Captive in the Dark -> ["Captive/Captor", "Dark Savior", "Morally Grey"]

*Reverse harem fantasy:*
Power of Five -> ["Why Choose", "Fated Mates", "Found Family"]



### 4. CREATURES (Max 3)
List fantasy/supernatural creatures or beings that are CENTRAL to the story — this includes species, supernatural entity types, and magical races (e.g., Fae, Vampires, Witches, Gods).

**WHAT COUNTS AS "CENTRAL":**
- Main character IS the creature or becomes one
- Primary love interest is the creature
- The creature is essential to the main plot (e.g., dragon riders, vampire hunters)
- The world/conflict revolves around the creature type

**WHAT DOES NOT COUNT:**
- Creatures mentioned briefly or as worldbuilding flavor
- Creatures that appear in one scene but don't drive the story
- Generic "magical beasts" that aren't specified or important

---

**COMMON CREATURE TYPES** (use reader-friendly, capitalized terms):

*Classic Fantasy:*
- "Dragons"
- "Fae" (includes faeries, sidhe, fair folk—use "Fae" as umbrella term)
- "Elves"
- "Dwarves"
- "Orcs"
- "Trolls"
- "Giants"
- "Goblins"

*Shapeshifters & Weres:*
- "Werewolves"
- "Shifters" (use for non-wolf shapeshifters: bears, cats, birds, etc.)
- "Skinwalkers"

*Undead & Dark Creatures:*
- "Vampires"
- "Ghosts"
- "Zombies"
- "Reapers"
- "Wraiths"

*Celestial & Divine:*
- "Angels"
- "Demons"
- "Devil"
- "Gods/Goddesses"
- "Demigods"
- "Fallen Angels"

*Elemental & Nature Spirits:*
- "Witches"
- "Wizards"
- "Elementals"
- "Nymphs"
- "Dryads"
- "Necromancer"

*Aquatic:*
- "Mermaids/Mermen"
- "Sirens"
- "Selkies"
- "Sea Monsters"

*Mythological:*
- "Phoenixes"
- "Griffins"
- "Centaurs"
- "Minotaurs"
- "Krakens"
- "Valkyries"
- "Djinn/Genies"
- "Kitsune"
- "Gargoyles"

*Sci-Fi/Other:*
- "Aliens"
- "Cyborgs"
- "Monsters" (generic, use only if no better classification exists)

*Special Cases:*
- "Unknown" — Use when the book features a unique, author-created creature that doesn't map to any established mythology or creature type. This is common in high fantasy where authors invent their own species. Only use "Unknown" if the creature is central AND genuinely unclassifiable.
- "Various" — Use when the book is set in a fantasy world with multiple creature types present, but no single creature type is central to the main plot or romance. Common in sprawling epic fantasies, urban fantasy with diverse supernatural populations, or adventure stories where the protagonist encounters many creatures without any being the focus.

---

**RULES:**

1. **Return up to 3 creatures maximum**
   - List in order of importance to the story
   - If only 1-2 creatures are central, only return those

2. **Return an empty array [] if:**
   - The book is contemporary/realistic fiction with no supernatural elements
   - The book has magic but no distinct creature types
   - Creatures are only mentioned in passing
   
   **Use ["Various"] if:**
   - The book is clearly a fantasy world with multiple creature types
   - Creatures exist and are part of the worldbuilding, but none are central to the main plot or romance
   - Example: An epic fantasy quest where the heroes encounter elves, dwarves, and dragons throughout, but the story is really about human protagonists and political intrigue

3. **Use the most specific accurate term**
   - If it's specifically werewolves, use "Werewolves" not "Shifters"
   - If it's a mix of shifter types, use "Shifters"
   - If it's clearly the Celtic/European fair folk tradition, use "Fae"

4. **Consolidate related creatures**
   - Don't list "Faeries" and "Fae" separately—use "Fae"
   - Don't list "Mermaids" and "Mermen" separately—use "Mermaids/Mermen"

5. **"Witches" clarification**
   - Use "Witches" only when they're portrayed as a supernatural species or distinct group with inherent powers
   - Do NOT use for human characters who simply practice spellcraft

6. **When to use "Unknown"**
   - The creature is clearly central to the story
   - It's a unique creation by the author (not just a renamed version of a known creature)
   - It doesn't reasonably fit any established creature category
   - Example: A book features "Venin"—dark magic-corrupted beings unique to that world -> "Unknown"
   - Example: A book features "the Fae" but calls them "Asterians" -> Still use "Fae" (it's a renamed known creature)

---

**EXAMPLES:**

*Fourth Wing* -> ["Dragons"] 
(Wyverns also appear but dragons are the central bonded creatures)

*ACOTAR* -> ["Fae", "Various"]
(The entire world revolves around Fae courts and politics)

*Twilight* -> ["Vampires", "Werewolves"]
(Both are central to the love triangle and plot)

*Ice Planet Barbarians* -> ["Aliens"]
(Blue-skinned Sa-khui are the primary species)

*The Witcher* -> ["Witches", "Monsters"]
(Geralt hunts various monsters; sorceresses are a distinct supernatural class)

*Zodiac Academy* -> ["Fae", "Dragons", "Shifters"]
(Multiple Fae orders with different creature forms)

*Project Hail Mary* -> []
(Sci-fi but no fantasy creatures—alien microbes don't count as "creatures" in this context)

*The Hunger Games* -> []
(Dystopian sci-fi, no supernatural creatures)

*Lord of the Rings* -> ["Various"]
(Elves, Dwarves, Orcs, Hobbits, and more exist—but the central story is Frodo's quest, not any single creature type)

*The Name of the Wind* -> ["Various"]
(Fantasy world with Fae and other creatures mentioned, but Kvothe is human and no creature is central)

*Percy Jackson* -> ["Gods/Goddesses", "Demigods"]
(Specific creatures ARE central here—don't use "Various")

*A unique high fantasy with author-invented species* -> ["Unknown"]
(Only if the creature truly doesn't map to any known type)



### 5. SUBGENRES (Max 3)
Classify the book's genre/subgenre. Be specific and accurate.

**ROMANCE & ROMANTASY SUBGENRES:**
- "Romantasy"
- "Paranormal Romance"
- "Vampire Romance"
- "Werewolf & Shifter Romance"
- "Fae Romance"
- "Dragon Romance"
- "Alien Romance"
- "Dark Romance"
- "Mafia Romance"
- "Gothic Romance"
- "Historical Romance"
- "Regency Romance"
- "Contemporary Romance"
- "Romantic Comedy"
- "Romantic Suspense"
- "Sports Romance"
- "Small Town Romance"
- "Holiday Romance"
- "Billionaire Romance"
- "Military Romance"
- "Reverse Harem Romance"
- "Enemies to Lovers Romance"
- "Action & Adventure Romance"
- "Sci-Fi Romance"
- "Time Travel Romance"
- "Steampunk Romance"

**FANTASY SUBGENRES:**
- "Epic Fantasy"
- "High Fantasy"
- "Dark Fantasy"
- "Urban Fantasy"
- "Cozy Fantasy"
- "Sword & Sorcery"
- "Grimdark"
- "Mythic Fantasy"
- "Fairy Tale Retelling"
- "Portal Fantasy"
- "Gaslamp Fantasy"
- "Military Fantasy"
- "Court Intrigue"
- "Magical Realism"

**HORROR & GOTHIC:**
- "Dark Fantasy Horror"
- "Gothic Fiction"
- "Paranormal Horror"
- "Supernatural Thriller"
- "Monster Horror"

**EROTICA SUBGENRES:**
- "Fantasy Erotica"
- "Paranormal Erotica"
- "Vampire Erotica"
- "Monster Erotica"
- "Dark Erotica"
- "BDSM Erotica"
- "Sci-Fi Erotica"

**SCIENCE FICTION:**
- "Space Opera"
- "Dystopian"
- "Post-Apocalyptic"
- "Cyberpunk"
- "Military Sci-Fi"
- "First Contact"

**OTHER FICTION:**
- "Thriller"
- "Mystery"
- "Suspense"
- "Action & Adventure"
- "Literary Fiction"
- "Historical Fiction"
- "Contemporary Fiction"
- "Women's Fiction"
- "Coming of Age"
- "Young Adult Fiction"
- "Middle Grade"

**NON-FICTION:**
- "Memoir"
- "Self-Help"
- "Biography"
- "True Crime"
- "Non-Fiction"

**GENRE SELECTION RULES:**

1. **Pick the MOST SPECIFIC applicable subgenre first**
   - If it's a vampire romance -> use "Vampire Romance" not just "Paranormal Romance"
   - If it's a fae romantasy -> use "Fae Romance" not just "Romantasy"

2. **Romance doesn't need to be in every subgenre label**
   - A romantasy book can be: ["Romantasy", "Dark Fantasy", "Court Intrigue"]
   - The first subgenre establishes it's romance; others add flavor
   - Good: ["Vampire Romance", "Gothic Fiction", "Dark Fantasy"]
   - Bad: ["Vampire Romance", "Paranormal Romance", "Dark Romance"] — too redundant

3. **Avoid Redundancy**
   - Do NOT list synonyms or near-duplicates as separate subgenres
   - "Romantasy", "Fantasy Romance", and "Romance Fantasy" are the SAME—use "Romantasy"
   - "Paranormal Romance" is a parent category—if you use "Vampire Romance", don't also add "Paranormal Romance"
   - Each subgenre should add DISTINCT information about the book
   - Bad: ["Romantasy", "Fantasy Romance", "Fae Romance"] — first two are duplicates
   - Good: ["Fae Romance", "Court Intrigue", "Dark Fantasy"] — each adds new info

4. **Layer from specific romance type -> setting/tone -> themes**
   - Example: ["Werewolf & Shifter Romance", "Dark Fantasy", "Action & Adventure"]
   - Example: ["Cozy Fantasy", "Romantic Comedy", "Small Town Romance"]
   - Example: ["Dark Romance", "Mafia Romance", "Suspense"]

5. **For non-romance books, lead with primary genre**
   - Example: ["Epic Fantasy", "Grimdark", "Military Fantasy"]
   - Example: ["Dystopian", "Young Adult Fiction", "Action & Adventure"]



### 6. SERIES INFORMATION
Provide series details if applicable:

- **name**: The series or universe name (null only if truly no series/universe connection exists)
- **position**: This book's number in the overall series (1 if standalone or first in series)
- **totalBooks**: Total books planned/published in the full series (1 if standalone, null if unknown)
- **status**: Publication status—are all books published and available?
  - "COMPLETE" = All books in the series/standalone have been published and released
  - "INCOMPLETE" = One or more books not yet published (includes pre-orders, announced sequels, or the searched book itself being unreleased)
  - "UNKNOWN" = Cannot determine publication status

- **isMultiArc**: Boolean indicating if this is a multi-arc series (see below)
- **arc**: Arc-specific details (only include if isMultiArc is true)
  - **arcNumber**: Which arc this book belongs to (1, 2, 3, etc.)
  - **name**: The arc name (if known, otherwise null) — do not infer arc names from protagonist names
  - **position**: This book's position within its arc
  - **totalBooks**: Total books in this specific arc
  - **status**: Publication status of this arc specifically

---

**STANDALONE BOOKS:**
- A standalone book has \`totalBooks: 1\` and \`position: 1\`
- Standalones CAN have a series name if they belong to a connected universe, shared world, or "standalone series" (where each book features different characters but shares a setting or side characters)
- \`name\` should only be \`null\` if the book has no series or universe connection whatsoever
- \`isMultiArc\` should be \`false\` for standalones
- Status depends on publication:
  - Already published standalone → \`status: "COMPLETE"\`
  - Pre-order / unreleased standalone → \`status: "INCOMPLETE"\`

---

**STANDARD SERIES BOOKS:**
- Return the actual series name, position, and total book count
- \`isMultiArc\` should be \`false\`
- \`arc\` should be \`null\`
- \`status: "COMPLETE"\` only if ALL books in the series have been published
- \`status: "INCOMPLETE"\` if any books are unreleased, including future planned installments

---

**MULTI-ARC SERIES:**
Some series contain multiple "arcs"—distinct story segments within a larger series, often featuring different main characters or romantic pairings while sharing a universe. Common in romantasy and paranormal romance.

Indicators of a multi-arc series:
- Different main couple/protagonist in different books
- Books are often grouped into duets, trilogies, or named arcs
- Marketing refers to "arcs," "duets," or specific couple pairings
- Can read arc 1 as complete, even if the overall series continues

Examples:
- **Crowns of Nyaxia** (6 books, 3 arcs): Each arc is a duet following a different couple
- **A Court of Thorns and Roses** (5+ books, multiple arcs): Books 1-3 follow Feyre, later books shift focus
- **Fever Series** by Karen Marie Moning: Multiple arcs within the larger series
- **Zodiac Academy** (9 books): Single continuous arc (NOT multi-arc—same protagonists throughout)

For multi-arc series:
- \`isMultiArc\`: \`true\`
- \`position\`: Book's position in the OVERALL series
- \`totalBooks\`: Total books in the OVERALL series
- \`status\`: Status of the OVERALL series
- \`arc.arcNumber\`: Which arc this book belongs to (1, 2, 3, etc.)
- \`arc.name\`: Name of this specific arc (e.g., "The Nightborn Duet") or null if no officially recognized name exists
- \`arc.position\`: Book's position within THIS ARC (e.g., 1 of 2)
- \`arc.totalBooks\`: Total books in THIS ARC
- \`arc.status\`: Status of THIS ARC (can be "COMPLETE" even if overall series is "INCOMPLETE")

---

**Examples:**

Published standalone with no series connection:
\`\`\`json
"series": {
  "name": null,
  "position": 1,
  "totalBooks": 1,
  "status": "COMPLETE",
  "isMultiArc": false,
  "arc": null
}
\`\`\`

Published standalone within a connected universe:
\`\`\`json
"series": {
  "name": "Bromance Book Club",
  "position": 3,
  "totalBooks": 1,
  "status": "COMPLETE",
  "isMultiArc": false,
  "arc": null
}
\`\`\`

Standard series - ongoing (e.g., The Empyrean):
\`\`\`json
"series": {
  "name": "The Empyrean",
  "position": 1,
  "totalBooks": 5,
  "status": "INCOMPLETE",
  "isMultiArc": false,
  "arc": null
}
\`\`\`

Standard series - complete (e.g., The Hunger Games):
\`\`\`json
"series": {
  "name": "The Hunger Games",
  "position": 1,
  "totalBooks": 3,
  "status": "COMPLETE",
  "isMultiArc": false,
  "arc": null
}
\`\`\`

Multi-arc series - first book (e.g., The Serpent and the Wings of Night):
\`\`\`json
"series": {
  "name": "Crowns of Nyaxia",
  "position": 1,
  "totalBooks": 6,
  "status": "INCOMPLETE",
  "isMultiArc": true,
  "arc": {
    "arcNumber": 1,
    "name": "The Nightborn Duet",
    "position": 1,
    "totalBooks": 2,
    "status": "COMPLETE"
  }
}
\`\`\`

Multi-arc series - second book of first arc:
\`\`\`json
"series": {
  "name": "Crowns of Nyaxia",
  "position": 2,
  "totalBooks": 6,
  "status": "INCOMPLETE",
  "isMultiArc": true,
  "arc": {
    "arcNumber": 1,
    "name": "The Nightborn Duet",
    "position": 2,
    "totalBooks": 2,
    "status": "COMPLETE"
  }
}
\`\`\`

Multi-arc series - arc name unknown:
\`\`\`json
"series": {
  "name": "Some Multi-Arc Series",
  "position": 3,
  "totalBooks": 8,
  "status": "INCOMPLETE",
  "isMultiArc": true,
  "arc": {
    "arcNumber": 2,
    "name": null,
    "position": 1,
    "totalBooks": 2,
    "status": "COMPLETE"
  }
}
\`\`\`


### 7. DESCRIPTION
Create a reader-friendly description with TWO parts:
Part 1 - Core Description (FIRST):
Write a 150–300 word description that hooks a reader and helps them decide if this book is for them. This is the most important part of the book slip.
How to write it:
Lead with the hook — open with the most compelling element: the protagonist's situation, the inciting conflict, or the central tension. Drop the reader into the story immediately.
Preserve the source's voice and energy. If the publisher description uses dramatic, punchy language — mirror that tone. If it's witty and playful — keep that feel. Do NOT flatten engaging source copy into bland, generic summary language.
Include specific, vivid details that make this book distinct — character names, world details, stakes. "A brutal dragon-rider academy where failure means death" is better than "a dangerous magical school."
End on tension or a question — leave the reader wanting more. The last sentence should create urgency or curiosity, not wrap things up neatly.
What to avoid:
Do NOT open with generic framing like "In a world where..." or "This is the story of..."
Do NOT strip out the personality of the source description — if the original is vivid and specific, your version should be too
Do NOT add dramatic language that isn't supported by the source material
Do NOT spoil major plot twists, reveals, or endings
Do NOT fabricate plot details, character traits, or events not present in the source
Source fidelity rule: Treat the publisher/source description as your primary reference. Reorganize it for clarity and flow, but preserve its hook, tone, key language, and specific details. You are editing for structure, not rewriting from scratch. If the source description is already strong, stay close to it. Only deviate significantly if the source is cluttered, spoiler-heavy, or poorly structured.

Part 2 - Additional Info (AFTER, separated by two line breaks):
Place supplemental context at the END, after two line breaks (\n\n). Keep Part 2 under 60 words total. Include only what is relevant — not every book will have all of these. If none apply meaningfully, omit Part 2 entirely.
Priority order (include in this order, skip any that don't apply):
Series reading order notes — e.g., "First in the Crowns of Nyaxia series." or "Can be read as a standalone." Do NOT spell out other book titles in the series.
Comparison titles — "For fans of..." (use only when well-known, accurate comparisons exist)
Notable author blurbs — brief, attributed quotes from other authors (only if widely cited)
Bestseller status or major awards — e.g., "#1 New York Times Bestseller" or "Hugo Award Winner"
Author accolades — e.g., "From the author of The Martian"

Rules:
Total description (Part 1 + Part 2 combined) must be under 400 words
Part 1 should be the bulk of the description; Part 2 is supplemental and brief
Do NOT open the description with bestseller info, awards, author quotes, or any Part 2 content
Focus on STORY first, credentials second — always
If the source description contains content or trigger warnings relevant to dark themes (dubious consent, graphic violence, rape, trafficking, torture, etc.), include a brief ⚠️ content note at the end of Part 1 or beginning of Part 2
Do NOT copy the source description verbatim — restructure and condense where needed while preserving its strengths
If you cannot find a reliable source description, write a concise, accurate description based on what you know about the book and flag confidence.overall as "MEDIUM" or "LOW"


---

## OUTPUT FORMAT

Return ONLY this JSON structure:

{
  "title": "Exact book title (REQUIRED when Amazon ASIN/titleFromUrl were provided above)",
  "author": "Primary author (REQUIRED when Amazon ASIN/titleFromUrl were provided above)",
  "ageLevel": "CHILDRENS" | "YA" | "NA" | "ADULT" | "EROTICA",
  "spiceCategory": "No Spice" | "Closed Door" | "Mild Spice" | "Confirmed Spice" | "High Spice" | "Erotica",
  "spiceRating": 0-5,
  "spiceIncreasesInSeries": true | false,
  "tropes": ["Trope 1", "Trope 2", "Trope 3", "Trope 4"],
  "creatures": ["Creature 1", "Creature 2"],
  "subgenres": ["Subgenre 1", "Subgenre 2"],
  "series": {
    "name": "Series Name" | null,
    "position": 1 | null,
    "totalBooks": 5 | null,
    "status": "COMPLETE" | "INCOMPLETE" | "UNKNOWN",
    "isMultiArc": false, 
    "arc": { 
      "arcNumber": 1, 
      "name": "Arc Name" | null, 
      "position": 1, 
      "totalBooks": 2, 
      "status": "COMPLETE" | "INCOMPLETE" | "UNKNOWN" 
    } | null 
  },
  "description": "Core description here.\\n\\nAdditional info here.",
  "confidence": {
    "spiceRating": "HIGH" | "MEDIUM" | "LOW",
    "overall": "HIGH" | "MEDIUM" | "LOW"
  },
  "amazonAsin": "B09B7XVLJG"
}

**IMPORTANT:** 
- Return ONLY valid JSON format
- All trope strings must EXACTLY match the approved list
- Empty arrays [] are valid for tropes, creatures, and subgenres when not applicable
- The confidence object helps flag when human review may be needed
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
      description: data.description || '',
      amazonAsin: data.amazonAsin || undefined,
    };

    if (typeof data.title === 'string' && data.title.trim()) {
      sanitized.title = data.title.trim();
    }
    if (typeof data.author === 'string' && data.author.trim()) {
      sanitized.author = data.author.trim();
    }

    // Validate ageLevel
    const validAgeLevels = ['CHILDREN', 'YA', 'NA', 'ADULT', 'EROTICA'];
    if (data.ageLevel && validAgeLevels.includes(data.ageLevel.toUpperCase())) {
      sanitized.ageLevel = data.ageLevel.toUpperCase();
    } else {
      sanitized.ageLevel = 'UNKNOWN';
    }

    // Validate spiceCategory
    const validSpiceCategories = ["No Spice", "Closed Door", "Mild Spice", "Confirmed Spice", "High Spice", "Erotica"];
    if (validSpiceCategories.includes(data.spiceCategory)) {
      sanitized.spiceCategory = data.spiceCategory;
    } else {
      sanitized.spiceCategory = "No Spice"; // Default fallback
    }

    // Validate spiceIncreasesInSeries
    sanitized.spiceIncreasesInSeries = !!data.spiceIncreasesInSeries;

    // Validate spiceRating - must be integer 0-5
    if (
      typeof data.spiceRating === 'number' &&
      data.spiceRating >= 0 && data.spiceRating <= 5
    ) {
      sanitized.spiceRating = Math.floor(data.spiceRating);
    } else if (typeof data.spiceRating === 'string') {
      // Try to extract number from string like "3" or "very hot spice"
      const numMatch = data.spiceRating.match(/\d+/);
      if (numMatch) {
        const num = parseInt(numMatch[0], 10);
        sanitized.spiceRating = (num >= 0 && num <= 5) ? num : 0;
      } else {
        sanitized.spiceRating = 0;
      }
    } else {
      sanitized.spiceRating = 0;
    }

    // Auto-correct age level based on spice rating (high spice requires mature rating)
    if (
      ((sanitized.spiceRating && sanitized.spiceRating >= 4) || ['High Spice', 'Erotica'].includes(sanitized.spiceCategory as string)) &&
      sanitized.ageLevel &&
      !['NA', 'ADULT', 'EROTICA'].includes(sanitized.ageLevel)
    ) {
      this.logger.warn(
        `Auto-correcting ageLevel from ${sanitized.ageLevel} to NA due to high spice (${sanitized.spiceCategory} / ${sanitized.spiceRating})`,
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
      let position = typeof s.position === 'number' ? s.position : 1;
      let totalBooks = typeof s.totalBooks === 'number' ? s.totalBooks : null;
      let status = ['COMPLETE', 'INCOMPLETE', 'UNKNOWN'].includes(s.status) ? s.status : 'UNKNOWN';

      if (totalBooks !== null && totalBooks < position) {
        totalBooks = position;
      }
      if (status === 'COMPLETE' && totalBooks === null) {
        status = 'UNKNOWN';
      }

      sanitized.series = {
        name: s.name || null,
        position,
        totalBooks,
        status,
        isMultiArc: !!s.isMultiArc,
        arc: null,
      };

      if (s.isMultiArc && s.arc && typeof s.arc === 'object') {
        const a = s.arc;
        let arcPosition = typeof a.position === 'number' ? a.position : null;
        let arcTotalBooks = typeof a.totalBooks === 'number' ? a.totalBooks : null;
        let arcStatus = ['COMPLETE', 'INCOMPLETE', 'UNKNOWN'].includes(a.status) ? a.status : 'UNKNOWN';

        if (arcPosition !== null && arcTotalBooks !== null && arcTotalBooks < arcPosition) {
           arcTotalBooks = arcPosition;
        }
        if (arcStatus === 'COMPLETE' && arcTotalBooks === null) {
           arcStatus = 'UNKNOWN';
        }

        sanitized.series.arc = {
          arcNumber: typeof a.arcNumber === 'number' ? a.arcNumber : null,
          name: a.name || null,
          position: arcPosition,
          totalBooks: arcTotalBooks,
          status: arcStatus,
        };
      }
    }

    if (data.confidence && typeof data.confidence === 'object') {
      sanitized.confidence = {
        spiceRating: ['HIGH', 'MEDIUM', 'LOW'].includes(data.confidence.spiceRating as string) ? data.confidence.spiceRating : 'LOW',
        overall: ['HIGH', 'MEDIUM', 'LOW'].includes(data.confidence.overall as string) ? data.confidence.overall : 'LOW',
      };
    }

    return sanitized;
  }
}
