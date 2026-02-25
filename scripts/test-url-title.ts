async function testTitle(url: string) {
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            }
        });
        const html = await res.text();
        const match = html.match(/<title>([^<]+)<\/title>/i);
        if (match && match[1]) {
            let title = match[1].trim();
            console.log(`[RAW] ${title}`);
            title = title.replace(/^Amazon\.com:\s*/i, '').split(':')[0].trim();
            title = title.split('|')[0].trim();
            title = title.split(' by ')[0].trim();
            console.log(`[CLEAN] ${title}`);
        } else {
            console.log('No title found.');
        }
    } catch (e) { console.log(e); }
}

async function run() {
    await testTitle('https://www.amazon.com/dp/0593546024');
    await testTitle('https://www.goodreads.com/book/show/25126849');
}
run();
