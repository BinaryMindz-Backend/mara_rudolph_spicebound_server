import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GOOGLE_BOOKS_KEY;

async function testGoogleBooks() {
    const query = 'Ice Planet Barbarians';
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=10&key=${apiKey}`;

    console.log(`Fetching from: ${url.replace(apiKey as string, 'HIDDEN_KEY')}`);

    const res = await fetch(url);
    const data = await res.json();

    if (!data.items) {
        console.log('No items found');
        return;
    }

    console.log(`Found ${data.items.length} items. Here are the top 5 ratings:`);

    for (let i = 0; i < Math.min(5, data.items.length); i++) {
        const item = data.items[i];
        const info = item.volumeInfo;
        console.log(`\n--- Result ${i + 1} ---`);
        console.log(`Title: ${info.title}`);
        console.log(`Authors: ${info.authors?.join(', ')}`);
        console.log(`Ratings Count: ${info.ratingsCount}`);
        console.log(`Average Rating: ${info.averageRating}`);
    }
}

testGoogleBooks().catch(console.error);
