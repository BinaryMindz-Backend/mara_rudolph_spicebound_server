# BookSlip Architecture & Developer Guide

## The One-Sentence Overview
The BookSlip module is a robust ingestion engine that takes user input (plain text or external URLs), resolves it against Google Books and Open Library, intelligently merges and deduplicates the metadata, uses an LLM to enrich it with subjective romance taxonomy (spice rating, tropes, subgenres), and returns a unified, frontend-ready canonical "Book Slip."

---

## 🏗 System Architecture & Flow

The BookSlip module operates as a sequential data pipeline designed to prevent duplicate books in the database while ensuring the highest possible quality of metadata.

### The Pipeline (Execution Flow):
1. **Input Reception (`BookSlipController`)**: Receives a `POST /book-slip/discover` request with raw user input.
2. **Input Detection (`input-detector.ts`)**: Analyzes the input to determine if it is plain text, a Goodreads URL, an Amazon URL, an Open Library URL, or a Google Books URL.
3. **ID Extraction (`url-normalizer.ts`)**: Parses known platform URLs to extract canonical identifiers like Amazon ASINs or Google Volume IDs.
4. **Pre-fetch Cache Check (`BookSlipService`)**: Queries the local database using extracted exact IDs (ISBN, ASIN, etc.) to see if the book already exists. *If yes, it immediately returns the book without making external API calls.*
5. **External Provider Fetching (`GoogleBooksProvider`, `OpenLibraryProvider`)**: If not found locally, the system searches Google Books and Open Library simultaneously in parallel.
6. **Data Merging (`merge-book-data.ts`)**: Combines metadata from both providers, resolving conflicts and picking the strongest data points (e.g., best description, highest resolution ISBN-13).
7. **Fallback Check (`BookSlipService`)**: Queries the database *again* using the normalized title/author retrieved from the external providers as a last-ditch deduplication attempt.
8. **AI Enrichment (`AiEnrichmentService`)**: Uses OpenAI (GPT-4o) to evaluate the book's title, author, description, and internal pre-trained knowledge to append subjective romance taxonomy (Age Level, Spice Rating 0-6, Tropes, Creatures, and precise Subgenres).
9. **Database Persistence**: Stores the fully formed Book and creates relationship `BookAlias` rows for every discovered exact ID (ISBN, ASIN, etc.) to ensure future O(1) lookups.
10. **Link Generation (`link-generator.ts`)**: Generates dynamic purchasing and affiliate links for Amazon and Bookshop.org.
11. **Slip Construction (`BookSlipService`)**: Returns the structured, canonical frontend response Object known as a "Book Slip".

---

## 📁 Folder & File Breakdown

Everything relevant to this pipeline lives within the localized `src/main/book-slip/` directory. Here is exactly what every file and folder is responsible for:

### 1. The Core Module
*   **`book-slip.module.ts`**: The NestJS module that ties the controllers, services, and providers together.
*   **`book-slip.controller.ts`**: The REST API controller containing the `@Post('discover')` endpoint that accepts client requests.
*   **`book-slip.service.ts`**: The main orchestrator. It manages the 11-step pipeline described above, coordinating all the external providers, database transactions, and utility functions.

### 2. The AI Engine (`src/main/book-slip/ai/`)
*   **`ai-enrichment.service.ts`**: Handles direct communication with the OpenAI API. It injects a highly structured system prompt instructing the LLM to classify the book against the strictly formatted Spicebound taxonomy using both external and pre-trained knowledge. Responsible for stripping markdown from LLM output, parsing JSON securely, and providing default fallbacks if the AI fails.

### 3. External API Providers (`src/main/book-slip/providers/`)
*   **`google-books.provider.ts`**: Fetches and formats data from the Google Books API. Contains custom, intelligent sorting logic that ranks search results based on exact title text matches *before* falling back to rating counts to avoid returning inaccurate sequel or Box-Set matches.
*   **`open-library.provider.ts`**: Fetches and formats data from the Open Library API. Useful for grabbing extra metadata (often good descriptions) that Google Books misses.

### 4. Utility Functions (`src/main/book-slip/utils/`)
*   **`input-detector.ts`**: A regex-based engine that instantly identifies the shape of the user string (e.g., recognizes if the input is `https://amazon.com/dp/B0B6K7ZJ5P` vs `"Fourth Wing"`).
*   **`url-normalizer.ts`**: Utility class that safely slices out specific IDs from messy user URLs (like ripping the `ASIN` off an amazon tracking link).
*   **`merge-book-data.ts`**: A pure functional utility that takes the resulting Payload from Google Books and the resulting Payload from Open Library and perfectly weaves them matching non-null properties into a single un-opinionated "ExternalBookData" object.
*   **`link-generator.ts`**: Uses internal rules to map ISBNs and ASINs into formatted affiliate storefront URLs (Amazon, Bookshop.org) cleanly formatted for the frontend response.

### 5. Type Definitions (`src/main/book-slip/types/`, `src/main/book-slip/dto/`)
*   **`book-source.types.ts`**: Defines strict TypeScript interfaces for how external data should look before it enters the database.
*   **`book-slip.response.ts`**: Defines the final structured `BookSlipResponse` DTO mapped to Swagger documentation so the frontend knows exactly what JSON to expect.
