export function buildEnrichmentPrompt(raw: any) {
  return `
You are a romance book metadata enrichment engine.

Infer missing romance-specific metadata.

Return ONLY valid JSON.

Book data:
${JSON.stringify(raw)}
`;
}
