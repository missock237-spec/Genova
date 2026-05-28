---
Task ID: 3
Agent: WhatsApp API Integration Agent
Task: Implement real WhatsApp Business API integration replacing stub routes

Work Log:
- Read all existing WhatsApp route files (send, call, config) and supporting libraries (security, db, session)
- Created `/src/lib/whatsapp-client.ts` — Full WhatsApp Business API client with:
  - `sendMessage(to, message)` — POST to WhatsApp Cloud API v21.0 /{phone_number_id}/messages
  - `initiateCall(to, message?)` — POST to WhatsApp Cloud API v21.0 /{phone_number_id}/calls
  - `verifyToken()` — GET to https://graph.facebook.com/v21.0/me for token validation
  - Phone number validation (E.164 international format)
  - Message sanitization (strip HTML tags, decode entities, collapse whitespace, 4096 char limit)
  - Retry logic with exponential backoff (500ms → 1s → 2s, max 3 retries)
  - Configurable timeout (default 15s) with AbortController
  - Custom `WhatsAppApiError` class with status codes
  - Singleton factory `getWhatsAppClient()` using env vars (WHATSAPP_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID)
  - Per-user phoneNumberId override support from DB config
- Updated `/src/app/api/whatsapp/send/route.ts`:
  - Replaced stub (log & return success) with real WhatsApp API call via `getWhatsAppClient()`
  - Added error handling: on API failure, logs as 'failed' status with error details, returns 502
  - On success, includes messageId and recipientWaId in response and action log
  - Preserved all existing validation (phone format, permission check, approval workflow)
- Updated `/src/app/api/whatsapp/call/route.ts`:
  - Replaced stub with real WhatsApp API call via `getWhatsAppClient()`
  - Added error handling with 'failed' status logging and 502 response
  - On success, includes callId in response and action log
  - Preserved all existing validation and approval workflow
- Created `/src/app/api/whatsapp/verify/route.ts`:
  - GET endpoint that verifies WhatsApp API token validity
  - Checks env vars are configured (WHATSAPP_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID)
  - Calls WhatsApp /me endpoint to validate the token
  - Returns: connected, configured, appId, appName, error, message
- Added `phoneNumberId` field to WhatsAppConfig Prisma model:
  - New optional String field for per-user Phone Number ID from Meta Business settings
  - Ran `bun run db:push` — schema synced successfully
- Updated `/src/app/api/whatsapp/config/route.ts`:
  - GET now includes `phoneNumberId` in select
  - POST now accepts and validates `phoneNumberId` (numeric string validation)
  - PUT now accepts and validates `phoneNumberId`
  - isActive logic updated to include phoneNumberId in the check
  - Activity logs include phoneNumberId in details
- Lint: Clean (zero errors/warnings)
- All existing patterns preserved: applySecurity, secureResponse, db imports, error handling

Stage Summary:
- WhatsApp Business API integration is REAL (no more stubs)
- 5 files modified/created: whatsapp-client.ts, send/route.ts, call/route.ts, verify/route.ts, config/route.ts
- 1 Prisma schema change: phoneNumberId added to WhatsAppConfig
- API token from .env is used for all WhatsApp API calls
- Per-user phoneNumberId override supported from DB config
- Full retry, timeout, error handling, and sanitization implemented
---
