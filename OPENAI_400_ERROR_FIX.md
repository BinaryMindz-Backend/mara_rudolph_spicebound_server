# OpenAI 400 Bad Request Error - FIX APPLIED

## Problem

When searching for books (e.g., "The Fellowship of the Ring"), the API was returning a **400 Bad Request** error from OpenAI:

```
[Nest] ERROR [AiEnrichmentService] OpenAI API error: 400 Bad Request
{
  "error": {
    "message": "Invalid parameter: 'response_format' of type 'json_object' is not supported with this model.",
    "type": "invalid_request_error",
    "param": "response_format",
    "code": null
  }
}
```

## Root Cause

The AI enrichment service was sending `response_format: { type: 'json_object' }` to the OpenAI API, but the configured model (`gpt-4`) does **not support** this response format constraint.

The `json_object` response format is only supported by:
- `gpt-4-turbo` (newer versions)
- `gpt-4o` and `gpt-4o-mini` (selected)

Our default model was `gpt-4` which doesn't support it.

## Solution Applied

**File**: [src/main/book-slip/ai/ai-enrichment.service.ts](src/main/book-slip/ai/ai-enrichment.service.ts)

**Change**: Removed `response_format: { type: 'json_object' }` from the OpenAI API request.

### Before:
```typescript
const requestBody = {
  model,
  messages: [...],
  temperature: 0.3,
  max_tokens: 500,
  response_format: { type: 'json_object' },  // ❌ REMOVED
};
```

### After:
```typescript
const requestBody = {
  model,
  messages: [...],
  temperature: 0.3,
  max_tokens: 500,  // ✅ No incompatible response_format
};
```

## Why This Works

1. **Prompt-based JSON**: The user prompt explicitly instructs: "Return ONLY this JSON structure (valid JSON only, no markdown)"
2. **Temperature 0.3**: Low temperature makes responses deterministic and favor following instructions
3. **No strict enforcement needed**: The model naturally follows the JSON format instruction without needing `response_format` constraint
4. **Model compatibility**: Works with all `gpt-4` variants without compatibility issues

## Testing Results

✅ **API now works without 400 errors**
- Book searches complete successfully
- AI enrichment produces valid JSON responses
- Persistence and caching working as designed

### Test Case: "The Fellowship of the Ring"
```
curl -X POST http://localhost:5050/book-slip/discover \
  -H "Content-Type: application/json" \
  -d '{"input": "The Fellowship of the Ring"}'

Response: HTTP 201 Created ✅
```

**Second search (cached):**
- Returns instantly from database
- No OpenAI API calls
- Identical data returned both times
- `created: false` indicates cached result

## Deployment

✅ **Build Status**: Zero TypeScript compilation errors  
✅ **Runtime Status**: All endpoints responding normally  
✅ **No database migration needed**  
✅ **No breaking API changes**

---

## Related Issues Fixed in This Session

1. **OpenAI 400 Bad Request Error** (THIS FIX) - Removed unsupported `response_format`
2. **Book Persistence Bug** (Earlier fix) - Removed redundant enrichment call from controller
3. **AI Enrichment Inconsistency** (Earlier fix) - Fixed temperature and validation logic

All three issues combined were causing "same book returns different details each time"  - Now completely resolved.

---

**Status**: ✅ **FIXED AND TESTED**

**Date**: February 22, 2026  
**Model**: gpt-4 (default), gpt-4o-mini (if specified)
