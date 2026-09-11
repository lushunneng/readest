# OAuth Flow and Token Management

**Contract Version**: 1.0.0  
**Phase**: 0 (Foundation)  
**Server**: oauth.miapikey.com  
**Last Updated**: 2026-09-11

This document defines the OAuth 2.0 authorization flow and token lifecycle for platform integrations, ensuring long-lived tokens remain server-side and clients never persist credentials locally.

## Architecture Overview

```
┌─────────────┐          ┌──────────────────┐          ┌─────────────────┐
│   Readest   │          │  oauth.miapikey  │          │   Platform API  │
│   Client    │          │     .com         │          │  (Reddit, etc)  │
└─────────────┘          └──────────────────┘          └─────────────────┘
      │                           │                              │
      │  1. Initiate Auth         │                              │
      ├──────────────────────────>│                              │
      │                           │                              │
      │  2. Redirect to Platform  │                              │
      │<──────────────────────────┤                              │
      │                           │                              │
      │  3. User Authorizes       │                              │
      ├───────────────────────────┼─────────────────────────────>│
      │                           │                              │
      │  4. Callback with Code    │                              │
      │<──────────────────────────┼──────────────────────────────┤
      │                           │                              │
      │  5. Exchange Code         │                              │
      ├──────────────────────────>│  6. Token Exchange           │
      │                           ├─────────────────────────────>│
      │                           │                              │
      │                           │  7. Access + Refresh Tokens  │
      │                           │<─────────────────────────────┤
      │                           │                              │
      │                           │  8. Store Encrypted Tokens   │
      │                           │      (Server-side DB)        │
      │                           │                              │
      │  9. Session Token (JWT)   │                              │
      │<──────────────────────────┤                              │
      │   (expires in 1 hour)     │                              │
```

## Flow Stages

### Stage 1: Authorization Initiation

**Client Request**:
```http
GET /auth/{platform}/authorize
Host: oauth.miapikey.com
```

**Server Response**:
```http
HTTP/1.1 302 Found
Location: https://platform.com/oauth/authorize?
  client_id={app_client_id}
  &redirect_uri=https://oauth.miapikey.com/callback/{platform}
  &response_type=code
  &scope={required_scopes}
  &state={csrf_token}
```

**Parameters**:
- `{platform}`: Platform identifier (reddit, threads, substack)
- `{app_client_id}`: Server's registered OAuth client ID for that platform
- `{csrf_token}`: Server-generated CSRF protection token (stored in session)
- `{required_scopes}`: Platform-specific scopes (see capability-matrix.md)

### Stage 2: User Authorization

User completes authorization on platform's OAuth consent screen. Platform redirects back to server callback URL with authorization code.

**Platform Callback**:
```http
GET /callback/{platform}?code={auth_code}&state={csrf_token}
Host: oauth.miapikey.com
```

**Server Validates**:
1. `state` matches stored CSRF token
2. `code` is present and well-formed

### Stage 3: Token Exchange

**Server → Platform Token Request**:
```http
POST /oauth/token
Host: platform.com
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={auth_code}
&client_id={app_client_id}
&client_secret={app_client_secret}
&redirect_uri=https://oauth.miapikey.com/callback/{platform}
```

**Platform → Server Token Response**:
```json
{
  "access_token": "ya29.a0AfH6SMBx...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "1//0gHCzxK9x...",
  "scope": "read history identity"
}
```

### Stage 4: Server-Side Token Storage

**Storage Schema** (PostgreSQL example):
```sql
CREATE TABLE oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  platform VARCHAR(50) NOT NULL,
  
  -- Encrypted token fields (AES-256-GCM)
  access_token_encrypted BYTEA NOT NULL,
  refresh_token_encrypted BYTEA NOT NULL,
  
  -- Token metadata
  scope TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  
  -- Audit fields
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  revoked_at TIMESTAMP,
  
  UNIQUE(user_id, platform)
);

CREATE INDEX idx_oauth_tokens_expires ON oauth_tokens(expires_at) 
  WHERE revoked_at IS NULL;
```

**Encryption**:
- Algorithm: AES-256-GCM
- Key derivation: HKDF with server master key
- Per-token unique IV stored with ciphertext
- Master key stored in environment variable `OAUTH_ENCRYPTION_KEY`

**Example Storage Code** (Node.js):
```typescript
import crypto from 'crypto';

function encryptToken(plaintext: string, masterKey: Buffer): Buffer {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  
  // Format: [IV (16 bytes)][Auth Tag (16 bytes)][Ciphertext]
  return Buffer.concat([iv, authTag, encrypted]);
}
```

### Stage 5: Client Session Token Issuance

After storing tokens server-side, issue a short-lived JWT to the client.

**JWT Structure**:
```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "sub": "user_12345",
    "platform": "reddit",
    "token_id": "uuid-of-stored-token",
    "iat": 1694449200,
    "exp": 1694452800
  }
}
```

**JWT Claims**:
- `sub`: User identifier
- `platform`: Platform this token grants access to
- `token_id`: Reference to server-side stored token (for revocation checks)
- `iat`: Issued at (Unix timestamp)
- `exp`: Expiration (iat + 3600 seconds = 1 hour)

**Server Response to Client**:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "session_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600,
  "platform": "reddit"
}
```

**Client Storage**:
- Session token stored in memory only (JavaScript variable)
- If client must persist across restarts: Use `sessionStorage` (clears on browser close)
- **Never** use `localStorage` or `IndexedDB` for OAuth tokens

## Content Fetching Flow

### Stage 6: Client Fetches Content

**Client Request**:
```http
GET /api/{platform}/content?url={encoded_url}
Host: oauth.miapikey.com
Authorization: Bearer {session_token}
```

**Server Processing**:
1. Validate JWT signature and expiration
2. Extract `token_id` and `user_id` from JWT payload
3. Check token not revoked in database
4. Retrieve and decrypt access token from database
5. Check access token expiration:
   - If valid: Use for platform API call
   - If expired: Refresh token (see Stage 7)
6. Call platform API with decrypted access token
7. Update `last_used_at` timestamp
8. Return content to client

**Server Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "platform": "reddit",
  "content_id": "t3_abc123",
  "title": "Interesting Article",
  "author": "username",
  "text": "Article content here...",
  "published_at": "2026-09-11T10:30:00Z",
  "url": "https://reddit.com/r/example/comments/abc123"
}
```

### Stage 7: Token Refresh (Automatic)

When access token expires, server automatically refreshes using stored refresh token.

**Server → Platform Refresh Request**:
```http
POST /oauth/token
Host: platform.com
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token={encrypted_refresh_token_decrypted}
&client_id={app_client_id}
&client_secret={app_client_secret}
```

**Platform → Server New Tokens**:
```json
{
  "access_token": "ya29.a0AfH6SMBx_NEW...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "1//0gHCzxK9x_NEW..."
}
```

**Server Updates Storage**:
- Replace old access token with new (encrypted)
- Replace old refresh token with new (encrypted)
- Update `expires_at` timestamp
- Continue with original API call transparently to client

**Client Impact**: None - client JWT remains valid, server handles refresh internally

## Token Revocation

### User-Initiated Revocation

**Client Request**:
```http
POST /auth/{platform}/revoke
Host: oauth.miapikey.com
Authorization: Bearer {session_token}
```

**Server Processing**:
1. Validate session token
2. Retrieve stored tokens
3. Call platform's revocation endpoint:
   ```http
   POST /oauth/revoke
   Host: platform.com
   Content-Type: application/x-www-form-urlencoded
   
   token={access_token}
   &client_id={app_client_id}
   &client_secret={app_client_secret}
   ```
4. Mark token as revoked in database (`revoked_at = NOW()`)
5. Invalidate all associated session JWTs (blacklist `token_id`)

**Server Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "message": "Authorization revoked for reddit"
}
```

### Platform-Side Revocation Detection

When platform has revoked access (user revoked in platform settings):

**Platform API Response**:
```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_token"

{
  "error": "invalid_token",
  "error_description": "The access token was revoked"
}
```

**Server Handling**:
1. Mark token as revoked in database
2. Return error to client with fallback suggestion:
   ```json
   {
     "error": {
       "code": "AUTH_REVOKED",
       "message": "Reddit authorization was revoked",
       "fallback_suggestion": "url_import"
     }
   }
   ```

## Security Measures

### Token Logging Constraints

**Prohibited**:
- Logging full access tokens
- Logging full refresh tokens
- Logging JWT session tokens

**Allowed**:
```typescript
// Log only token prefix (first 8 characters)
logger.info('Token refreshed', {
  user_id: userId,
  platform: 'reddit',
  token_prefix: accessToken.substring(0, 8),
  expires_at: expiresAt
});
```

### HTTPS Enforcement

- All endpoints require HTTPS (TLS 1.3)
- HTTP requests return `301 Moved Permanently` to HTTPS
- HSTS header enforced: `Strict-Transport-Security: max-age=31536000; includeSubDomains`

### CSRF Protection

- All authorization flows use state parameter with cryptographic random value
- State stored in server session, validated on callback
- State expires after 10 minutes

### Rate Limiting

**Per User**:
- Authorization attempts: 5 per hour per platform
- Content fetch: Platform-specific (see capability-matrix.md)

**Per IP**:
- Authorization attempts: 100 per hour
- Content fetch: 1000 per hour

### Token Rotation

**Access Tokens**:
- Short-lived (typically 1 hour per platform)
- Automatically refreshed by server
- Never sent to client

**Refresh Tokens**:
- Long-lived (platform-dependent, typically 60-90 days)
- Rotated on each refresh where platform supports it
- Old refresh token invalidated after successful rotation

**Session Tokens (JWT)**:
- 1 hour expiration
- Client must re-request if expired (server validates stored token still active)

## Error Handling

### Common Error Codes

| Code | Trigger | Client Action |
|------|---------|---------------|
| `AUTH_REQUIRED` | No session token provided | Redirect to authorization flow |
| `AUTH_EXPIRED` | Session token expired | Request new session token |
| `AUTH_REVOKED` | Token revoked (user or platform) | Fall back to URL import |
| `RATE_LIMIT_EXCEEDED` | Platform rate limit hit | Queue retry with exponential backoff |
| `PLATFORM_ERROR` | Platform API returned error | Fall back to URL import |
| `PERMISSION_DENIED` | Content requires higher permissions | Skip or fall back to paste |

### Degradation Path

1. **OAuth fails** → Try public API (if B-class platform)
2. **Public API fails** → URL import (client pastes article URL)
3. **URL import fails** → Manual paste (client copies article text)

## Implementation Checklist

### Server Setup (oauth.miapikey.com)

- [ ] Domain DNS configured and verified
- [ ] TLS certificate installed (Let's Encrypt or equivalent)
- [ ] PostgreSQL database provisioned
- [ ] `oauth_tokens` table created with encryption fields
- [ ] Environment variables configured:
  - `OAUTH_ENCRYPTION_KEY` (32-byte hex string)
  - `DATABASE_URL` (PostgreSQL connection string)
  - `JWT_SECRET` (32-byte hex string)
- [ ] Per-platform OAuth credentials registered:
  - [ ] Reddit: client_id, client_secret, redirect_uri
  - [ ] Threads: client_id, client_secret, redirect_uri
  - [ ] Substack (if using official): MCP OAuth credentials
- [ ] Rate limiting middleware configured
- [ ] Logging configured with token masking

### Client Implementation

- [ ] Authorization initiation endpoint integrated
- [ ] OAuth callback handling (receive session token)
- [ ] Session token storage in memory or `sessionStorage`
- [ ] Content fetch with `Authorization: Bearer` header
- [ ] Error handling for all OAuth error codes
- [ ] Fallback to URL import on auth failure
- [ ] Token expiration handling (request new session token)

### Testing

- [ ] Full OAuth flow tested for each A-class platform
- [ ] Token refresh tested (simulate expired access token)
- [ ] Revocation tested (user-initiated and platform-initiated)
- [ ] CSRF protection verified
- [ ] Rate limiting verified
- [ ] Token encryption/decryption verified
- [ ] Session token expiration tested
- [ ] Fallback paths tested (auth failure → URL import)

## Technology Stack Recommendation

See `v10-report.md` for detailed server-side technology stack proposal.

## References

- OAuth 2.0 RFC: [datatracker.ietf.org/doc/html/rfc6749](https://datatracker.ietf.org/doc/html/rfc6749)
- OAuth 2.1 Draft: [datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-10](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-10)
- JWT RFC: [datatracker.ietf.org/doc/html/rfc7519](https://datatracker.ietf.org/doc/html/rfc7519)
- Token Binding: [datatracker.ietf.org/doc/html/rfc8471](https://datatracker.ietf.org/doc/html/rfc8471)
