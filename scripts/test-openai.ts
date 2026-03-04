import fs from 'fs';
import { APPROVED_TROPES } from '../src/common/constants/tropes.js';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.OPENAI_KEY || process.env.OPENAI_API_KEY;

const systemPrompt = `You are a romance book metadata enrichment engine. Your role is to analyze book information and classify it according to the Spicebound taxonomy.

CRITICAL RULES:
1. Return ONLY valid JSON, no markdown, no explanations, no extra text
2. All numerical ratings must be integers (0-6 for spice)
3. All arrays must contain strings from the approved lists ONLY
4. If a field cannot be determined with confidence, use the minimum/default value
5. Prefer precision over creativity - if unsure, use UNKNOWN or 0

YOUR RESPONSE MUST be valid JSON that can be parsed.`;

const userPrompt = `Analyze this book and return ONLY valid JSON. No explanations, no markdown.

BOOK: Title="Fourth Wing" | Author="Rebecca Yarros" | Description="Twenty-year-old Violet Sorrengail was supposed to enter the Scribe Quadrant... Instead, her mother, the commanding general, forces her into the Riders Quadrant..."

SPICE RATING (0-6):
0=No romance, 1=Cute kisses, 2=Sweet fade, 3=Warm descriptive, 4=Spicy explicit, 5=Hot frequent, 6=Erotica

AGE LEVEL (must match rating - if spice>=4 use NA+):
CHILDREN | YA | NA | ADULT | EROTICA | UNKNOWN

TROPES (max 4, must be exact matches):
${APPROVED_TROPES.join(', ')}

CREATURES: Dragons, Fae, Vampires, Shifters, etc. (max 3, [] if none)
SUBGENRES: Romance, Fantasy, Horror, etc. (max 3, [] if none)
SERIES: {name, index, total, status:"COMPLETE"|"INCOMPLETE"} or null

JSON ONLY - validate and return:
{
  "ageLevel": "UNKNOWN|CHILDREN|YA|NA|ADULT|EROTICA",
  "spiceRating": 0-6,
  "tropes": ["approved", "tropes"],
  "creatures": ["type"],
  "subgenres": ["genre"],
  "series": {"name": null, "index": null, "total": null, "status": "UNKNOWN"} | null
}`;

async function main() {
  console.log('Sending request to OpenAI...');
  const requestBody = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 500,
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('API Error:', JSON.stringify(errorData, null, 2));
    return;
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  console.log('Raw API Response Content:');
  console.log(content);
}

main().catch(console.error);
