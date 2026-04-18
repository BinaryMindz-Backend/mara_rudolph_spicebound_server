import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.OPENAI_KEY || process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('Missing OPENAI_KEY');
  process.exit(1);
}

const client = new OpenAI({ apiKey });

async function main() {
  try {
    console.log('Calling OpenAI SDK with gpt-5-mini...');
    const response = await client.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: 'You are a test assistant. Reply with JSON.' },
        { role: 'user', content: 'Return {"hello":"world"} only' },
      ],
      max_completion_tokens: 200,
    });

    console.log('SDK response choices:', response.choices?.length);
    console.log('Raw content:', response.choices?.[0]?.message?.content);
  } catch (e) {
    console.error('SDK call failed', e);
  }
}

main();
