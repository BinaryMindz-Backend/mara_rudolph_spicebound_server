BookSlip module does ONE thing:

Take anything the user gives → normalize → find or create a canonical book → return a Book Slip

Think of it as:

User Input
   ↓
Input Classification
   ↓
External Book Discovery
   ↓
Canonical Merge
   ↓
Reuse or Create Book
   ↓
Structured Book Slip









Exact Runtime Flow (Step-by-Step)

Let’s walk through what happens when this endpoint is hit.

🔹 STEP 1: Request hits controller

Example request:

POST /book-slip/discover
Content-Type: application/json

{
  "input": "Fourth Wing by Rebecca Yarros"
}


Controller calls:

return this.bookSlipService.discoverBook(dto.input);

🔹 STEP 2: Input type detection
const inputType = detectInputType(input);


This function checks:

Input	Detected As
Amazon URL	AMAZON_URL
Google Books URL	GOOGLE_BOOKS_URL
OpenLibrary URL	OPEN_LIBRARY_URL
Anything else	TEXT

Why this matters:
Different input types require different fetch strategies.

🔹 STEP 3: ASIN extraction (only for Amazon)
if (inputType === InputType.AMAZON_URL) {
  asin = extractAsin(input);
}


Example:

https://www.amazon.com/dp/B0B6K7ZJ5P
→ asin = B0B6K7ZJ5P


⚠️ Amazon does not give book metadata
ASIN is used only for lookup + affiliate links

🔹 STEP 4: External book discovery
Case A — Google Books URL
googleData = await googleBooks.fetchByVolumeId(input);

Case B — Open Library URL
openLibraryData = await openLibrary.fetchById(input);

Case C — Plain text (MOST COMMON)
googleData = await googleBooks.search(input);
openLibraryData = await openLibrary.search(input);


You now have:

Google’s version of the book

Open Library’s version of the book

Both may be partial or conflicting.

🔹 STEP 5: Merge external data (CRITICAL STEP)
const merged = mergeExternalData(googleData, openLibraryData);


This function:

Picks the best title

Picks the best author

Normalizes ISBN

Chooses strongest description

Chooses best rating

Result:

{
  title: "Fourth Wing",
  author: "Rebecca Yarros",
  isbn13: "9781649374042",
  publishedYear: 2023,
  description: "...",
  externalAvgRating: 4.6,
  externalRatingCount: 120000
}


This is your canonical external truth.

🔹 STEP 6: Validate identity (hard stop)
if (!merged.title || !merged.author) {
  throw new Error('Unable to resolve book identity');
}


Why?

Without title + author, a book is meaningless

Prevents polluted DB entries

🔹 STEP 7: Reuse existing book (deduplication)
const existingBook = await prisma.book.findFirst(...)


You are checking:

Same ISBN

Same Google Volume ID

Same Open Library ID

Same ASIN

If found:
return buildSlip(existingBook, false);


🟢 No duplication
🟢 Faster response
🟢 Same canonical ID

🔹 STEP 8: Create canonical book (only if new)
await prisma.book.create(...)


Important things happening here:

You normalize title & author

You store external ratings

You intentionally do NOT enrich yet

This is correct architecture.

🔹 STEP 9: Build Book Slip response
return buildSlip(book, true);


This returns a frontend-ready object, not a raw DB row.