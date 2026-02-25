import * as cheerio from 'cheerio';

async function testTitle(url: string) {
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        });
        const html = await res.text();
        const $ = cheerio.load(html);
        console.log(`\nURL: ${url}`);
        console.log(`Title: ${$('title').text()}`);
    } catch (e) { }
}

async function run() {
    await testTitle('https://www.amazon.com/dp/isbn/9780593546024');
    await testTitle('https://www.amazon.com/gp/product/9780593546024');
}
run();
