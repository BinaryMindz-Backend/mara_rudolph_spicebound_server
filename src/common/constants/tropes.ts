/**
 * Controlled vocabulary for romance book tropes
 * AI must select ONLY from this list
 */
export const APPROVED_TROPES = [
  // Core Relationship Dynamics
  'Enemies to Lovers',
  'Friends to Lovers',
  'Forbidden Love',
  'Slow Burn',
  'Instalove',

  // Proximity, Situational & Plot-Driven
  'Forced Proximity',
  'Fake Relationship',
  'Marriage of Convenience',
  'Arranged Marriage',
  'Captive/Captor',
  'Trials',

  // Emotional & Interpersonal Tension
  'Grumpy x Sunshine',
  'Morally Grey',
  'Touch Her and Die',
  'Mutual Pining',
  'Angst with a Happy Ending',
  'Alphahole',

  // Fate, Power & Fantasy-Specific
  'Fated Mates',
  'Chosen One',
  'Magic-Bonded Pair',
  'Soulmates',
  'Power Imbalance',
  'Hidden Identity/Secret Royalty',
  'Villain Gets the Girl',
  'Dark Savior',
  'Reincarnation',

  // Found Family & Community
  'Found Family',
  'Ragtag Group on a Quest',

  // Identity & Relationship Structure
  'LGBTQ+',
  'Love Triangle',
  'Reverse Harem/Why Choose',

  // Power Dynamics & Age
  'Age Gap',
  'Teacher x Student',
];

export function isValidTrope(trope: string): boolean {
  return APPROVED_TROPES.includes(trope);
}

export function validateTropes(tropes: string[]): boolean {
  if (!Array.isArray(tropes)) return false;
  if (tropes.length < 1 || tropes.length > 4) return false;
  return tropes.every((t) => isValidTrope(t));
}
