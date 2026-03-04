import * as dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '.env') });

async function runTest(query: string) {
  console.log(`\n=== Testing: "${query}" ===`);
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=10&key=${process.env.GOOGLE_BOOKS_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.items) {
    console.log('No items found.');
    return;
  }

  for (let i = 0; i < Math.min(5, data.items.length); i++) {
    const info = data.items[i].volumeInfo;
    console.log(
      `[${i + 1}] Title: ${info.title} | Author: ${info.authors?.[0]} | Ratings: ${info.ratingsCount} | Categories: ${info.categories?.join(', ')}`,
    );
  }
}

async function run() {
  await runTest('Darkfever');
  await runTest('Darkfever by Karen Moning'); // Misspelled name or missing "Marie"
}
run();
