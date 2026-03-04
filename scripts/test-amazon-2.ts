async function testAmazon10() {
  const isbn10 = '0593546024'; // Ice Planet Barbarians Google Books ISBN-10
  const url = `https://www.amazon.com/dp/${isbn10}`;
  console.log(`Testing: ${url}`);
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    console.log(`Status: ${res.status}`);
  } catch (e) {
    console.log(`Error:`, e);
  }
}
testAmazon10();
