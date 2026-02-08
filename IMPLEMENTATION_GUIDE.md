# Implementation Guide: AI Book Metadata Enrichment

## System Architecture

```
POST /book-slip/discover
    ↓
BookSlipController.discoverBook(input)
    ↓
BookSlipService.discoverBook(input)
    └─ Detects input type (URL/title/search)
    └─ Queries external providers (GoogleBooks, OpenLibrary)
    └─ Merges external data
    └─ Creates/retrieves Book from DB
    └─ Returns BookSlipResponse
    ↓
BookMetadataEnrichmentService.enrichBookMetadata(enrichmentData)
    └─ Calls GPT-4 with system + user prompts
    └─ Parses JSON response
    └─ Validates all fields against spec
    └─ Returns BookMetadataEnrichmentResponse
    ↓
Controller merges both responses
    ↓
Returns EnrichedBookSlipResponse with unified data
```

## Request/Response Flow

### Request
```json
{
  "input": "Fourth Wing by Rebecca Yarros"
}
```

### Response Structure
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Resource created successfully",
  "data": {
    "bookId": "...",
    "title": "...",
    "author": "...",
    "description": "...",
    "releaseYear": 2023,
    "ageLevel": "NA",
    "spiceRating": 4,
    "tropes": ["Enemies to Lovers", "Forced Proximity", "Touch Her and Die", "Morally Grey"],
    "creatures": ["Dragons"],
    "subgenres": ["Romantasy", "Military Fantasy"],
    "series": {
      "name": "The Empyrean",
      "position": 1,
      "totalBooks": 5,
      "status": "INCOMPLETE"
    },
    "links": { "amazon": "...", "bookshop": "..." },
    "created": true,
    "confidence": {
      "spiceRating": "HIGH",
      "overall": "HIGH"
    }
  },
  "meta": {}
}
```

## Key Files

### Core Services
- `src/main/book-slip/book-slip.controller.ts` - Route handler, merges AI+DB data
- `src/main/book-slip/book-slip.service.ts` - Book discovery and DB creation
- `src/main/book-slip/ai/book-metadata-enrichment.service.ts` - GPT-4 enrichment with validation

### DTOs & Types
- `src/main/book-slip/dto/discover-book.dto.ts` - Input validation
- `src/main/book-slip/dto/enriched-book-slip.response.ts` - Response schema
- `src/main/book-slip/ai/dto/book-metadata-enrichment.dto.ts` - AI DTO definitions
- `src/main/book-slip/types/book-source.types.ts` - External provider interfaces

### Utilities
- `src/main/book-slip/utils/input-detector.ts` - Detects URL vs title
- `src/main/book-slip/utils/merge-book-data.ts` - Merges GoogleBooks/OpenLibrary
- `src/main/book-slip/providers/google-books.provider.ts` - Google Books API
- `src/main/book-slip/providers/open-library.provider.ts` - Open Library API

## Validation Rules

### Age Level
- Must be: CHILDRENS | YA | NA | ADULT | EROTICA
- YA cannot have spiceRating >= 4 (constraint enforced)

### Spice Rating
- Integer 0-6 only
- 0 = no romance, 1-3 = conservative, 4-6 = explicit
- Must match age level (4+ requires NA/ADULT/EROTICA)

### Tropes
- Max 4 from approved list (37 total)
- Empty array acceptable
- Must use exact strings

### Creatures
- Max 3 from predefined list
- Empty array acceptable
- Can use "Unknown" for unique author-created creatures
- Can use "Various" for multiple non-central types

### Subgenres
- Max 3 from approved list (60+ total)
- No redundancy (e.g., don't use Romantasy + Fantasy Romance)
- Each must add distinct information

### Series
- `name`: String or null
- `position`: Integer ≥1 or null (book's number in series)
- `totalBooks`: Integer ≥1 or null (total books in series)
- `status`: COMPLETE | INCOMPLETE | UNKNOWN

### Confidence
- `spiceRating`: HIGH | MEDIUM | LOW
- `overall`: HIGH | MEDIUM | LOW
- Both required

## Environmental Variables

```bash
OPENAI_KEY=sk-...          # OpenAI API key (required)
GOOGLE_BOOKS_KEY=...       # Google Books API key (required)
OPENAI_MODEL=gpt-4-turbo   # Model (default: gpt-4-turbo)
```

## Testing the Endpoint

### Terminal Test
```bash
curl -X POST http://localhost:5050/book-slip/discover \
  -H "Content-Type: application/json" \
  -d '{"input": "Fourth Wing by Rebecca Yarros"}'
```

### JavaScript Test
```javascript
const response = await fetch('http://localhost:5050/book-slip/discover', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ input: 'Fourth Wing by Rebecca Yarros' })
});
const result = await response.json();
console.log(result.data.confidence);
```

## Troubleshooting

### Issue: Empty tropes array but tropes expected
**Cause**: AI determined no tropes apply confidently  
**Solution**: Update book description to include plot details, or manually adjust confidence in follow-up

### Issue: Spice rating lower than expected
**Cause**: AI applied "lean conservative" rule due to uncertainty  
**Solution**: Provide more detailed description or pre-enriched data to AI

### Issue: Series status is UNKNOWN
**Cause**: External providers don't have series data, and AI uncertain  
**Solution**: Create book record with series data if known, or accept conservative response

### Issue: Validation error on confidence
**Cause**: AI returned invalid confidence level  
**Solution**: Check OpenAI API logs, may need to regenerate or adjust prompt

## Performance Notes

- First API call: ~2-3 seconds (DB + GPT-4)
- Subsequent calls (cached book): ~100-500ms
- GPT-4 model: ~1-2 seconds per call
- Database queries: ~10-50ms each

## Security Considerations

- Validates all input before processing
- Sanitizes trope/subgenre/creature strings against approved list
- Enforces JSON-only output from AI (no injection)
- Rate limiting recommended on `/book-slip/discover`
- OPENAI_KEY should be kept in `.env` (never committed)

## Future Enhancements

1. **Caching**: Add Redis caching for frequently requested books
2. **Batch Processing**: Support analyzing multiple books in one request
3. **Manual Override**: Allow users to provide feedback and override AI classifications
4. **Series Detection**: Improve series metadata extraction from external sources
5. **Content Warnings**: Add specific content warning tags based on tropes/spice
6. **Diversity**: Track cultural representation and diverse character metadata
