async function testAmazonRedirects() {
    const isbn13 = '9780593546024';
    const urls = [
        `https://www.amazon.com/exec/obidos/ISBN=${isbn13}/`,
        `https://www.amazon.com/dp/isbn/${isbn13}`,
        `https://www.amazon.com/gp/product/${isbn13}`,
        `https://www.amazon.com/s?i=stripbooks&rh=p_66%3A${isbn13}`
    ];

    for (const url of urls) {
        console.log(`\nTesting: ${url}`);
        try {
            const res = await fetch(url, {
                redirect: 'manual', headers: {
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                }
            });
            console.log(`Status: ${res.status}`);
            if (res.headers.get('location')) console.log(`Redirects to: ${res.headers.get('location')}`);
        } catch (e) {
            console.log(`Error:`, e.message);
        }
    }
}
testAmazonRedirects();
