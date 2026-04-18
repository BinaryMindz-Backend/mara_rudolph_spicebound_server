import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.OPENAI_KEY || process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('Missing OPENAI_KEY');
  process.exit(1);
}

async function main() {
  const model = 'gpt-5-mini';
  const input = 'Say hello in JSON: {"hello": "world"}';
  const body = {
    model,
    input,
    max_output_tokens: 200,
  };

  console.log('Calling Responses API with body:', JSON.stringify(body, null, 2));

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  console.log('Status:', res.status, res.statusText);
  const data = await res.json().catch((e) => {
    console.error('Failed to parse JSON', e);
    return null;
  });
  console.log('Full response JSON:');
  console.log(JSON.stringify(data, null, 2));
}

main().catch((e) => console.error(e));
