const amazonUrls = [
  'https://www.amazon.com/Ice-Planet-Barbarians-Ruby-Dixon/dp/0593546024',
  'https://www.amazon.com/dp/0593546024',
  'https://amazon.com/A-Court-of-Thorns-and-Roses/dp/B00UZH95RA',
];

const goodreadsUrls = [
  'https://www.goodreads.com/book/show/25126849-ice-planet-barbarians',
  'https://www.goodreads.com/book/show/25126849.Ice_Planet_Barbarians',
  'https://www.goodreads.com/book/show/25126849',
];

for (const input of amazonUrls) {
  let searchQuery = input;
  const urlObj = new URL(input);
  const pathParts = urlObj.pathname.split('/').filter(Boolean);
  // e.g., ["Ice-Planet-Barbarians-Ruby-Dixon", "dp", "0593546024"]
  const dpIndex = pathParts.indexOf('dp');
  if (dpIndex > 0) {
    searchQuery = decodeURIComponent(pathParts[dpIndex - 1].replace(/-/g, ' '));
  }
  console.log('Amazon search query:', searchQuery);
}

for (const input of goodreadsUrls) {
  let searchQuery = input;
  // Match the slug after the ID. e.g. 25126849-ice-planet-barbarians or 25126849.Ice_Planet_Barbarians
  const match = input.match(
    /goodreads\.com\/book\/show\/\d+(?:[.-]([^?/#]+))?/,
  );
  if (match && match[1]) {
    searchQuery = decodeURIComponent(match[1].replace(/[-_]/g, ' '));
  }
  console.log('Goodreads search query:', searchQuery);
}
