async function testBookshop() {
    const isbn = '9780593546024';
    const url = `https://bookshop.org/p/books/_/${isbn}`;
    console.log(`Testing: ${url}`);
    try {
        const res = await fetch(url, { redirect: 'manual' });
        console.log(`Status: ${res.status}`);
        if (res.headers.get('location')) {
            console.log(`Redirects to: ${res.headers.get('location')}`);
        }
    } catch (e) {
        console.log(`Error:`, e);
    }
}
testBookshop();
