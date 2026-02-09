# Account Deletion Endpoint - Testing Guide

## Overview
A new **DELETE** endpoint has been added to allow users to permanently delete their own account with password confirmation.

## Endpoint Details

### Route
```
DELETE /auth/account
```

### Authentication
Required: JWT Bearer Token (access token)

### Request Body
```json
{
  "password": "user_current_password"
}
```

### Response (Success - 200)
```json
{
  "success": true,
  "message": "Account deleted successfully. All associated data has been removed.",
  "data": {
    "success": true
  }
}
```

### Response (Errors)
- **401 Unauthorized**: Password is incorrect or user not found
- **400 Bad Request**: Password field missing or invalid

## Features
✅ Requires valid JWT token (only authenticated users can delete their own account)
✅ Password verification required (security measure)
✅ Cascading deletes all user-related data:
  - User library books
  - Ratings
  - Subscriptions
✅ Full Swagger documentation with examples
✅ Proper error handling

## How to Test in Swagger

1. **Login** first using the `/auth/login` endpoint to get your access token
2. Go to the **`DELETE /auth/account`** endpoint in Swagger
3. Click "Authorize" and paste your access token
4. In the request body, enter:
   ```json
   {
     "password": "your_current_password"
   }
   ```
5. Click "Try it out"
6. The response should indicate successful deletion

## Files Created/Modified
- ✅ `src/main/auth/dto/delete-account.dto.ts` - New DTO with validation
- ✅ `src/main/auth/auth.controller.ts` - New DELETE endpoint added
- ✅ `src/main/auth/auth.service.ts` - New deleteAccount method added
