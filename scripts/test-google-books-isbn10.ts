import * as dotenv from 'dotenv';
dotenv.config();
async function run() {
  const url = `https://www.googleapis.com/books/v1/volumes?q=Ice%20Planet%20Barbarians&maxResults=1&key=${process.env.GOOGLE_BOOKS_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  const info = data.items[0].volumeInfo;
  console.log('Title:', info.title);
  console.log('Identifiers:', info.industryIdentifiers);
}
run();
