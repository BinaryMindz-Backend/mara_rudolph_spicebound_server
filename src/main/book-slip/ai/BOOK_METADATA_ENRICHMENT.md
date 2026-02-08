# Book Metadata Enrichment System

## Overview

The Book Metadata Enrichment Service leverages OpenAI's GPT-4 to analyze books and provide comprehensive metadata tailored to romance and romantasy readers. The system uses a sophisticated prompt engineering approach to classify books across multiple dimensions including age level, spice rating, tropes, creatures, subgenres, and series information.

## Features

### 1. **Age Level Classification**
- **CHILDRENS** (Ages 8-12): Middle-grade, innocent romance at most
- **YA** (Ages 13-17): Teen protagonists, fade-to-black romance, coming-of-age themes
- **NA** (Ages 18-25): College/early-20s protagonists, may include explicit content
- **ADULT** (Ages 25+): Mature protagonists, explicit content possible
- **EROTICA** (Adults only): Sexual content is the primary focus

### 2. **Spice Rating (0-6 Scale)**
- **0** - None: No romantic content
- **1** - Cute: Kissing, hand-holding, innocent romance
- **2** - Sweet: Closed-door, attraction/tension implied
- **3** - Warm: 1-3 open-door scenes, mild descriptiveness
- **4** - Spicy: Descriptive scenes, multiple instances (e.g., Fourth Wing level)
- **5** - Hot Spicy: Frequent, detailed scenes
- **6** - Explicit/Kink: Erotica-level content with explicit elements

### 3. **Tropes (3-4 Maximum)**
The system identifies primary relationship dynamics, situational setups, emotional themes, and fantasy elements from an extensive approved list including:
- Enemies to Lovers, Friends to Lovers, Forbidden Love, Slow Burn, Instalove
- Forced Proximity, Fake Relationship, Arranged Marriage, Trials
- Fated Mates, Chosen One, Soulmates, Found Family, and more

### 4. **Creature Classification (Up to 3)**
Identifies central fantasy creatures including:
- Dragons, Fae, Elves, Vampires, Werewolves, Shifters
- Witches, Angels, Demons, Mermaids, and more
- Supports both standard creatures and author-created "Unknown" creatures

### 5. **Subgenre Tagging (Up to 3)**
Categorizes books across romance, fantasy, horror, erotica, sci-fi, and general fiction subgenres.

### 6. **Series Information**
Provides:
- Series name (or null if standalone)
- Book position in series
- Total books (or null if unknown)
- Status: COMPLETE, INCOMPLETE, or UNKNOWN

### 7. **AI-Generated Description**
Creates reader-friendly descriptions with:
- Core plot hook (3-5 sentences)
- Additional metadata (awards, bestseller status, "For fans of..." comparisons)

### 8. **Confidence Ratings**
Tracks confidence levels for spice rating and overall analysis (HIGH/MEDIUM/LOW) to flag entries needing human review.

## API Usage

### Endpoint: `POST /book-slip/enrich-metadata`

#### Request Body
```json
{
  "title": "Fourth Wing",
  "author": "Rebecca Yarros",
  "publishedYear": 2023,
  "description": "Twenty-year-old Violet Sorrengail was supposed to enter the Scribe Quadrant...",
  "categories": ["Fantasy", "Romance", "Dragons"],
  "pageCount": 640,
  "seriesInfo": "Book 1 of The Empyrean series"
}
```

#### Response
```json
{
  "ageLevel": "NA",
  "spiceRating": 4,
  "tropes": [
    "Enemies to Lovers",
    "Forced Proximity",
    "Touch Her and Die",
    "Morally Grey"
  ],
  "creatures": ["Dragons"],
  "subgenres": ["Romantasy", "Military Fantasy"],
  "series": {
    "name": "The Empyrean",
    "position": 1,
    "totalBooks": 5,
    "status": "INCOMPLETE"
  },
  "description": "Twenty-year-old Violet Sorrengail, fragile-boned and better suited for the scholarly Scribe Quadrant, is forced by her commanding general mother into the brutal Riders Quadrant at Basgiath War College. There, she must survive ruthless training, bond with a dragon, and navigate enemies who want her dead—including the devastatingly powerful Xaden Riorson, whose hatred of her family runs deep.\n\n#1 New York Times Bestseller. First in The Empyrean series.",
  "confidence": {
    "spiceRating": "HIGH",
    "overall": "HIGH"
  }
}
```

## Implementation Details

### Service Architecture

**File:** `src/main/book-slip/ai/book-metadata-enrichment.service.ts`

The service:
1. Accepts a `EnrichBookRequest` with book details
2. Constructs a sophisticated system prompt defining analysis rules
3. Builds a user prompt with book information
4. Calls OpenAI GPT-4 API with temperature=0.7 for balanced creativity/accuracy
5. Parses and validates JSON response
6. Returns validated `BookMetadataEnrichmentResponse`

### DTO Structure

**File:** `src/main/book-slip/ai/dto/book-metadata-enrichment.dto.ts`

- `EnrichBookRequest`: Input parameters for analysis
- `BookMetadataEnrichmentResponse`: Structured output
- `SeriesInfo`: Series metadata
- `ConfidenceLevel`: Confidence ratings

### Integration

**Controller:** `src/main/book-slip/book-slip.controller.ts`
- Added `enrichMetadata()` endpoint
- Integrates with existing book discovery flow

**Module:** `src/main/book-slip/book-slip.module.ts`
- Registered `BookMetadataEnrichmentService` as provider
- Exported for use in other modules

## Key Features

### Accuracy & Conservatism
- Leans conservative (lower spice ratings, fewer tropes) when uncertain
- Uses confidence levels to flag uncertain analyses
- Validates all outputs against defined enums and constraints

### Multi-Genre Support
- Works for romance, fantasy, horror, sci-fi, and literary fiction
- Applies tropes appropriately to all genres (not just romance)
- Recognizes non-romance books need metadata too

### Reader-Centric Design
- Uses BookTok/Bookstagram terminology readers understand
- Prioritizes what readers need to know (not assumptions from cover/title)
- Specific over generic (e.g., "Fae Romance" vs "Paranormal Romance")

### No Fabrication
- Returns `null` or "UNKNOWN" for unknown information
- Never guesses series totals or publication dates
- Bases analysis on actual content and reputation

## Error Handling

- **Missing Required Fields**: Returns `BadRequestException`
- **Invalid JSON Response**: Logs error and throws `BadRequestException`
- **Invalid Spice Rating**: Validates 0-6 range
- **Invalid Age Level**: Validates against enum
- **OpenAI API Errors**: Logs and throws with descriptive message

## Configuration

Requires environment variable:
- `OPENAI_KEY`: OpenAI API key with GPT-4 access

## Performance Notes

- Uses GPT-4-Turbo model for accuracy
- Average response time: 2-5 seconds per book
- Temperature set to 0.7 for balanced creativity and consistency
- Max tokens: 2000 per response

## Future Enhancements

1. **Caching**: Cache results for frequently analyzed books
2. **Batch Processing**: Support bulk analysis of multiple books
3. **Human Review Workflow**: Queue low-confidence results for manual review
4. **Custom Trope Lists**: Allow users to add custom tropes
5. **Multi-Language Support**: Extend to non-English books
6. **Content Warning Tags**: Additional specific content warnings beyond spice rating
7. **Reader Preference Matching**: Match books to reader preferences based on metadata
