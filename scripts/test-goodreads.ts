import * as cheerio from 'cheerio';

async function run() {
    const query = 'Ice Planet Barbarians Ruby Dixon';
    const url = `https://www.goodreads.com/search?q=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        },
    });

    const html = await response.text();
    const $ = cheerio.load(html);

    console.log('Found elements: ', $('.minirating').length);

    $('.minirating').each((_i, el) => {
        const text = $(el).text().trim();
        console.log(`[${_i}] -> "${text}"`);

        // Test extraction logic
        const cleanText = text.replace(/—/g, '-').replace(/–/g, '-');
        const avgMatch = cleanText.match(/([\d.]+)\s+avg rating/);
        const countMatch = cleanText.match(/-\s+([\d,]+)\s+rating\w*/);

        if (avgMatch && countMatch) {
            const avg = parseFloat(avgMatch[1]);
            const count = parseInt(countMatch[1].replace(/,/g, ''), 10);
            console.log(`    Extracted: Avg=${avg}, Count=${count}`);
        }
    });
}

run();
