async function testUrls() {
  const isbn = '9780593546024'; // Ice Planet Barbarians

  const urls = [
    `https://www.amazon.com/dp/${isbn}`,
    `https://bookshop.org/a/0/${isbn}`,
    `https://bookshop.org/books/${isbn}`,
    `https://www.goodreads.com/book/isbn/${isbn}`,
  ];

  for (const url of urls) {
    try {
      console.log(`\nTesting: ${url}`);
      const res = await fetch(url, { redirect: 'manual' });
      console.log(`Status: ${res.status}`);
      if (res.headers.get('location')) {
        console.log(`Redirects to: ${res.headers.get('location')}`);
      }
    } catch (e) {
      console.log(`Error:`, e);
    }
  }
}

testUrls();
