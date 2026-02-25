async function run() {
    const asinIsbn10 = '0593546024'; // Ice Planet Barbarians
    const asinKindle = 'B00UZH95RA'; // ACOTAR Kindle
    const goodreadsId = '25126849'; // Ice Planet Barbarians

    console.log('Testing OpenLibrary with Goodreads ID...');
    const olRes = await fetch(`https://openlibrary.org/search.json?q=goodreads_id:${goodreadsId}`);
    const olData = await olRes.json();
    console.log('OpenLibrary Goodreads:', olData.docs.length > 0 ? olData.docs[0].title : 'Not Found');

    console.log('\nTesting Google Books with ASIN (ISBN-10)...');
    const gbRes1 = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${asinIsbn10}`);
    const gbData1 = await gbRes1.json();
    console.log('GoogleBooks ISBN-10:', gbData1.items ? gbData1.items[0].volumeInfo.title : 'Not Found');

    console.log('\nTesting Google Books with Kindle ASIN as general query...');
    const gbRes2 = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${asinKindle}`);
    const gbData2 = await gbRes2.json();
    console.log('GoogleBooks Kindle ASIN:', gbData2.items ? gbData2.items[0].volumeInfo.title : 'Not Found');
}
run();
