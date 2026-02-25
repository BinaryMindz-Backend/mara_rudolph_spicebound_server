async function testOpenLibrary() {
    const query = 'Ice Planet Barbarians';
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5`;

    console.log(`Fetching from: ${url}`);

    const res = await fetch(url);
    const data = await res.json();

    if (!data.docs) {
        console.log('No items found');
        return;
    }

    console.log(`Found ${data.docs.length} items. Here are the top 5 ratings:`);

    for (let i = 0; i < Math.min(5, data.docs.length); i++) {
        const doc = data.docs[i];
        console.log(`\n--- Result ${i + 1} ---`);
        console.log(`Title: ${doc.title}`);
        console.log(`Authors: ${doc.author_name?.join(', ')}`);
        console.log(`Ratings Count: ${doc.ratings_count}`);
        console.log(`Average Rating: ${doc.ratings_average}`);
    }
}

testOpenLibrary().catch(console.error);
