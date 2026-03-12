import re

with open('src/main/book-slip/ai/ai-enrichment.service.ts', 'r') as f:
    content = f.read()

# 1. Update EnrichedBookData
content = content.replace(
'''  ageLevel?: string;
  spiceRating?: number;
  tropes?: string[];''',
'''  ageLevel?: string;
  spiceCategory?: string;
  spiceRating?: number;
  spiceIncreasesInSeries?: boolean;
  tropes?: string[];'''
)

# 2. Update temperature
content = content.replace(
'''        temperature: 0.3, // Low temperature for consistent, factual responses''',
'''        temperature: 0.2, // Low temperature for consistent, factual responses'''
)

# 3. Update buildSystemPrompt 0-6 to 0-5
content = content.replace(
'''  3. All numerical ratings must be integers (0-6 for spice)''',
'''  3. All numerical ratings must be integers (0-5 for spice)'''
)

# 4. Update default spiceRating returns in enrichBook catch blocks (there are several)
# Actually leaving them as spiceRating: 0 is fine, maybe I should add spiceCategory: "No Spice"
content = content.replace(
'''          ageLevel: 'UNKNOWN',
          spiceRating: 0,
          tropes: [],''',
'''          ageLevel: 'UNKNOWN',
          spiceCategory: 'No Spice',
          spiceRating: 0,
          spiceIncreasesInSeries: false,
          tropes: [],'''
)
content = content.replace(
'''        ageLevel: 'UNKNOWN',
        spiceRating: 0,
        tropes: [],''',
'''        ageLevel: 'UNKNOWN',
        spiceCategory: 'No Spice',
        spiceRating: 0,
        spiceIncreasesInSeries: false,
        tropes: [],'''
)

# 5. Extract and replace SPICE RATING (0-6) -> SPICE RATING block
spice_old_start = '### 2. SPICE RATING (0-6)'
spice_old_end = '### 3. TROPES (Select 3-4 from approved list)'

spice_new = '''### 2. SPICE RATING

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

'''

content = content[:content.find(spice_old_start)] + spice_new + content[content.find(spice_old_end):]

# 6. Extract and replace SERIES INFORMATION block
# Note it appears under ### 6. SERIES INFORMATION
series_old_start = '### 6. SERIES INFORMATION'
series_old_end = '### 7. DESCRIPTION'

series_new = '''### 6. SERIES INFORMATION
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


'''
content = content[:content.find(series_old_start)] + series_new + content[content.find(series_old_end):]

# 7. Extract and replace DESCRIPTION block
desc_old_start = '### 7. DESCRIPTION'
desc_old_end = '---'
idx1 = content.find(desc_old_start)
idx2 = content.find(desc_old_end, idx1)

desc_new = '''### 7. DESCRIPTION
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
Place supplemental context at the END, after two line breaks (\\n\\n). Keep Part 2 under 60 words total. Include only what is relevant — not every book will have all of these. If none apply meaningfully, omit Part 2 entirely.
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


'''
content = content[:idx1] + desc_new + content[idx2:]

# 8. Output format block
out_old_start = '  "ageLevel": "CHILDRENS" | "YA" | "NA" | "ADULT" | "EROTICA",'
out_old_end = '  "tropes": ["Trope 1", "Trope 2", "Trope 3", "Trope 4"],'

out_new = '''  "ageLevel": "CHILDRENS" | "YA" | "NA" | "ADULT" | "EROTICA",
  "spiceCategory": "No Spice" | "Closed Door" | "Mild Spice" | "Confirmed Spice" | "High Spice" | "Erotica",
  "spiceRating": 0-5,
  "spiceIncreasesInSeries": true | false,
  "tropes": ["Trope 1", "Trope 2", "Trope 3", "Trope 4"],'''

content = content.replace(
    '  "ageLevel": "CHILDRENS" | "YA" | "NA" | "ADULT" | "EROTICA",\n  "spiceRating": 0-6,\n  "tropes": ["Trope 1", "Trope 2", "Trope 3", "Trope 4"],',
    out_new
)

# 9. Sanitize logic
sanitize_old = '''    // Validate spiceRating - must be integer 0-6
    if (
      typeof data.spiceRating === 'number' &&
      isValidSpiceRating(data.spiceRating)
    ) {
      sanitized.spiceRating = Math.floor(data.spiceRating);
    } else if (typeof data.spiceRating === 'string') {
      // Try to extract number from string like "3" or "very hot spice"
      const numMatch = data.spiceRating.match(/\\d+/);
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
    }'''

sanitize_new = '''    // Validate spiceCategory
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
      const numMatch = data.spiceRating.match(/\\d+/);
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
      ((sanitized.spiceRating && sanitized.spiceRating >= 4) || ['High Spice', 'Erotica'].includes(sanitized.spiceCategory)) &&
      sanitized.ageLevel &&
      !['NA', 'ADULT', 'EROTICA'].includes(sanitized.ageLevel)
    ) {
      this.logger.warn(
        `Auto-correcting ageLevel from ${sanitized.ageLevel} to NA due to high spice (${sanitized.spiceCategory} / ${sanitized.spiceRating})`,
      );
      sanitized.ageLevel = 'NA';
    }'''

# Replace import isValidSpiceRating since we hardcoded 0-5 validation
content = content.replace("import { isValidSpiceRating } from '../../../common/constants/spice-rating.js';\n", "")
content = content.replace(sanitize_old, sanitize_new)

# Series Sanity checks
series_old = '''    // Preserve series and arc info and validate
    if (data.series && typeof data.series === 'object') {
      const s = data.series;
      sanitized.series = {
        name: s.name || null,
        position: typeof s.position === 'number' ? s.position : 1,
        totalBooks: typeof s.totalBooks === 'number' ? s.totalBooks : null,
        status: ['COMPLETE', 'INCOMPLETE', 'UNKNOWN'].includes(s.status)
          ? s.status
          : 'UNKNOWN',
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
          status: ['COMPLETE', 'INCOMPLETE', 'UNKNOWN'].includes(a.status)
            ? a.status
            : 'UNKNOWN',
        };
      }
    }'''

series_new = '''    // Preserve series and arc info and validate
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
    }'''

content = content.replace(series_old, series_new)

with open('src/main/book-slip/ai/ai-enrichment.service.ts', 'w') as f:
    f.write(content)

