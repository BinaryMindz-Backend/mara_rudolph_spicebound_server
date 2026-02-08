# Quick Reference: Book Metadata Enrichment API

## 🚀 Quick Start

### API Endpoint
```
POST /book-slip/enrich-metadata
```

### Minimal Request
```bash
curl -X POST http://localhost:5050/book-slip/enrich-metadata \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Fourth Wing",
    "author": "Rebecca Yarros"
  }'
```

### Full Request (Recommended)
```bash
curl -X POST http://localhost:5050/book-slip/enrich-metadata \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Fourth Wing",
    "author": "Rebecca Yarros",
    "publishedYear": 2023,
    "description": "Twenty-year-old Violet Sorrengail was supposed to enter the Scribe Quadrant...",
    "categories": ["Fantasy", "Romance", "Dragons"],
    "pageCount": 640,
    "seriesInfo": "Book 1 of The Empyrean series"
  }'
```

## 📋 Response Fields Explained

### Age Level
- **CHILDRENS** - Ages 8-12, innocent romance only
- **YA** - Ages 13-17, no explicit sexual content
- **NA** - Ages 18-25, may include explicit content
- **ADULT** - Ages 25+, explicit content possible
- **EROTICA** - Adult-focused sexual content

### Spice Rating (0-6)
- **0** - None (no romance)
- **1** - Cute (kissing, hand-holding)
- **2** - Sweet (closed-door, tension implied)
- **3** - Warm (1-3 scenes, not descriptive)
- **4** - Spicy (multiple descriptive scenes)
- **5** - Hot Spicy (frequent intense scenes)
- **6** - Explicit/Kink (erotica-level content)

### Common Tropes
- Enemies to Lovers
- Friends to Lovers
- Forced Proximity
- Slow Burn
- Fated Mates
- Chosen One
- Found Family
- Arranged Marriage
- [See full list in documentation]

### Creatures
- Dragons, Fae, Elves, Vampires, Werewolves
- Witches, Shifters, Angels, Demons
- Mermaids/Mermen, Phoenixes, Griffins
- [See full list in documentation]

### Subgenres
- Romantasy, Paranormal Romance, Fae Romance
- Epic Fantasy, Dark Fantasy, Urban Fantasy
- Dystopian, Space Opera, Thriller
- [See full list in documentation]

## 💡 Example Responses

### Fantasy Romance
```json
{
  "ageLevel": "NA",
  "spiceRating": 4,
  "tropes": ["Enemies to Lovers", "Forced Proximity"],
  "creatures": ["Dragons"],
  "subgenres": ["Romantasy", "Military Fantasy"]
}
```

### Young Adult
```json
{
  "ageLevel": "YA",
  "spiceRating": 1,
  "tropes": ["Love Triangle", "Chosen One"],
  "creatures": [],
  "subgenres": ["Dystopian", "Young Adult Fiction"]
}
```

### Dark Romance
```json
{
  "ageLevel": "ADULT",
  "spiceRating": 5,
  "tropes": ["Captive/Captor", "Dark Savior", "Morally Grey"],
  "creatures": ["Vampires"],
  "subgenres": ["Dark Romance", "Paranormal Romance"]
}
```

## ⚙️ Configuration

Required in `.env`:
```env
OPENAI_KEY=sk-proj-your-key-here
```

## 🔧 Common Use Cases

### Frontend Book Cards
```javascript
// Use metadata to display book details
const enriched = await fetch('/book-slip/enrich-metadata', {
  method: 'POST',
  body: JSON.stringify({ title, author })
});
```

### Search Filters
```javascript
// Filter books by age level, spice rating, tropes
books.filter(b => 
  b.ageLevel === 'NA' && 
  b.spiceRating >= 3 &&
  b.tropes.includes('Enemies to Lovers')
);
```

### Book Recommendations
```javascript
// Match reader preferences to book metadata
const match = analyzeCompatibility(userPreferences, bookMetadata);
```

## 📊 Performance

- Response Time: 2-5 seconds per book
- Model: GPT-4-Turbo
- Typical Request: ~1000 tokens

## ❌ Error Handling

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Title and author are required",
  "errors": ["..."]
}
```

## 📝 Files & Locations

- **Service**: `src/main/book-slip/ai/book-metadata-enrichment.service.ts`
- **Controller**: `src/main/book-slip/book-slip.controller.ts`
- **DTOs**: `src/main/book-slip/ai/dto/book-metadata-enrichment.dto.ts`
- **Full Docs**: `src/main/book-slip/ai/BOOK_METADATA_ENRICHMENT.md`

## 🎯 Pro Tips

1. **Include description** - More accurate analysis with full plot summary
2. **Add categories** - Helps classification (e.g., "Fantasy", "Romance", "LGBTQ+")
3. **Specify series info** - Ensures correct series metadata extraction
4. **Check confidence** - Look at confidence levels to identify uncertain analyses
5. **Use for filtering** - Perfect for user preference matching

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| 400 "Title/author required" | Include both required fields |
| Slow response | Check OpenAI API quota/limits |
| Wrong age level | Ensure description is accurate |
| Missing tropes | Book may not clearly fit common tropes |
| Empty creatures array | Not a fantasy book or creatures not central |

---

**Status**: ✅ Ready to Use
**Integration**: Seamless with existing API
**Support**: Full documentation available
