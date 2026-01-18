export const EnrichedBookSchema = {
  type: 'object',
  required: ['ageLevel', 'spiceRating', 'tropes', 'creatures', 'subgenres'],
  properties: {
    ageLevel: { type: 'string' },
    spiceRating: { type: 'number' },
    tropes: { type: 'array', items: { type: 'string' } },
    creatures: { type: 'array', items: { type: 'string' } },
    subgenres: { type: 'array', items: { type: 'string' } },
    series: {
      type: ['object', 'null'],
    },
  },
};
