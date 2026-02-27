/**
 * Controlled vocabulary for romance book tropes
 * AI must select ONLY from this list
 */
export const APPROVED_TROPES = [
  // Core Relationship Dynamics
  'Enemies to Lovers',
  'Hate to Love',
  'Friends to Lovers',
  'Forbidden Love',
  'Slow Burn',
  'Instalove',
  'Second-Chance Romance',

  // Proximity & Situational
  'Forced Proximity',
  'Fake Relationship',
  'Marriage of Convenience',
  'Arranged Marriage',
  'Captive/Captor',
  'Bodyguard/Protector',
  'Trials',

  // Emotional & Interpersonal
  'Grumpy x Sunshine',
  'Morally Grey',
  'Morally Black',
  'Touch Her and Die',
  'Mutual Pining',
  'Angst with a Happy Ending',
  'Alphahole',
  'Bully Romance',
  'Redemption Arc',

  // Fate, Power & Fantasy
  'Fated Mates',
  'Chosen One',
  'Magic-Bonded Pair',
  'Soulmates',
  'Power Imbalance',
  'Hidden Identity',
  'Secret Royalty',
  'Villain Gets the Girl',
  'Dark Savior',
  'Reincarnation',
  'Hidden Memories',
  'Curse/Curse Breaking',

  // Found Family & Community
  'Found Family',
  'Ragtag Group on a Quest',

  // Identity & Relationship Structure
  'LGBTQ+',
  'Love Triangle',
  'Why Choose',
  'Dual POV',

  // Power Dynamics
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
