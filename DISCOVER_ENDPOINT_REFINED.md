# Book Slip Discover Endpoint - Refined Implementation

## Overview
The `/book-slip/discover` endpoint has been refined to consolidate all book metadata enrichment capabilities into a single, powerful route. The separate `/book-slip/enrich-metadata` route has been removed.

## Endpoint Details

### Route
```
POST /book-slip/discover
Content-Type: application/json
```

### Base URL
```
http://localhost:5050/book-slip/discover
```

### Response Status Code
- **200** - Success

## Request Body

### Required Fields
- `title` (string) - The book title
- `author` (string) - The book author

### Optional Fields
- `publishedYear` (number) - Publication year
- `description` (string) - Book synopsis or description
- `categories` (string[]) - Book categories/subjects
- `pageCount` (number) - Total pages
- `seriesInfo` (string) - Series information

### Example Request

```bash
curl -X POST http://localhost:5050/book-slip/discover \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Fourth Wing",
    "author": "Rebecca Yarros",
    "publishedYear": 2023,
    "description": "Twenty-year-old Violet Sorrengail was supposed to enter the Scribe Quadrant, where she could live a quiet life among books and history. But her mother, the commanding general, orders her into the brutal Riders Quadrant instead, where dragon riders are made.",
    "categories": ["Fantasy", "Romance", "Dragons"],
    "pageCount": 640,
    "seriesInfo": "Book 1 of The Empyrean series"
  }'
```

## Response Format

### Success Response (200)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Request successful",
  "data": {
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
    "description": "Twenty-year-old Violet Sorrengail, fragile-boned and better suited for the scholarly Scribe Quadrant, is forced by her commanding general mother into the brutal Riders Quadrant...",
    "confidence": {
      "ageLevel": "HIGH",
      "spiceRating": "MEDIUM",
      "tropes": "MEDIUM",
      "creatures": "HIGH",
      "subgenres": "HIGH",
      "series": "HIGH"
    }
  },
  "meta": {}
}
```

## Response Fields

### ageLevel (string)
Classification of intended reader age level:
- `CHILDRENS` - Ages 8-12
- `YA` - Ages 13-17
- `NA` - Ages 18-25 (New Adult)
- `ADULT` - Ages 25+
- `EROTICA` - Adults only

### spiceRating (number 0-6)
Romantic/sexual heat level:
- `0` - None
- `1` - Cute (hand-holding, innocent romance)
- `2` - Sweet (closed door, intimacy implied)
- `3` - Warm (1-3 open door scenes)
- `4` - Spicy (descriptive scenes, more than 2)
- `5` - Hot Spicy (frequent, detailed scenes)
- `6` - Explicit/Kink (erotica-level)

### tropes (string[])
List of narrative tropes (3-4 typically):
- Core relationship dynamics: "Enemies to Lovers", "Friends to Lovers", "Slow Burn", etc.
- Situational: "Forced Proximity", "Arranged Marriage", "Trials", etc.
- Emotional: "Morally Grey", "Angst with a Happy Ending", "Found Family", etc.

### creatures (string[])
Fantasy/supernatural creatures central to the story (max 3):
- Examples: "Dragons", "Fae", "Vampires", "Werewolves", "Shifters", "Various"

### subgenres (string[])
Genre classifications (max 3):
- Examples: "Romantasy", "Dark Fantasy", "Dystopian", "Military Fantasy", "Court Intrigue"

### series (object)
Series information with fields:
- `name` - Series name (or null if standalone)
- `position` - Book number in series
- `totalBooks` - Total books in series (or null if unknown)
- `status` - "COMPLETE" | "INCOMPLETE" | "ONGOING" | "UNKNOWN"

### description (string)
AI-generated reader-friendly description (3-5 sentences) followed by any relevant info (awards, bestseller status, etc.)

### confidence (object)
Confidence levels for each metadata dimension:
- `ageLevel` - HIGH | MEDIUM | LOW
- `spiceRating` - HIGH | MEDIUM | LOW
- `tropes` - HIGH | MEDIUM | LOW
- `creatures` - HIGH | MEDIUM | LOW
- `subgenres` - HIGH | MEDIUM | LOW
- `series` - HIGH | MEDIUM | LOW

## Error Responses

### 400 - Bad Request
Missing required fields (title, author) or invalid data format

```json
{
  "statusCode": 400,
  "message": "Bad Request",
  "error": "..."
}
```

### 500 - Internal Server Error
OpenAI API error or response parsing failure

```json
{
  "statusCode": 500,
  "message": "Internal Server Error"
}
```

## Testing via Swagger UI

1. Navigate to: **http://localhost:5050/docs**
2. Find the **Book Slip** section
3. Locate **POST /book-slip/discover**
4. Click **Try it out**
5. Use one of the example request bodies
6. Click **Execute**
7. View the enriched metadata response

## Implementation Details

### Files Modified
- `src/main/book-slip/dto/discover-book.dto.ts` - Updated DTO with metadata enrichment fields
- `src/main/book-slip/book-slip.controller.ts` - Refined discover endpoint, removed enrich-metadata route
- Service layer remains unchanged (`book-metadata-enrichment.service.ts`)

### Key Changes
1. **DiscoverBookDto** now accepts full book information for metadata analysis
2. **Discover endpoint** now calls `BookMetadataEnrichmentService` directly
3. **Removed** separate `/book-slip/enrich-metadata` route (consolidated into discover)
4. **Swagger documentation** fully updated with examples and response schemas

### Processing Flow
```
POST /book-slip/discover
    ↓
DiscoverBookDto validation
    ↓
BookMetadataEnrichmentService.enrichBookMetadata()
    ↓
OpenAI GPT-4 analysis
    ↓
JSON parsing & validation
    ↓
Response with 8 metadata dimensions
```

## Response Time
- Typical: **2-5 seconds** (real-time OpenAI API call)

## Notes
- All trope strings must match the approved list exactly
- Temperature set to 0.3 for consistent, factual responses
- Confidence levels help identify data that may need human review
- Series status reflects publication state, not future plans
