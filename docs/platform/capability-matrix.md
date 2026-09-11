# Platform Capability Matrix

**Contract Version**: 1.0.0  
**Phase**: 0 (Foundation)  
**Last Updated**: 2026-09-11

This document maps the 9 platforms targeted for V10 integration, classifying each by capability tier (A/B/C), authorization method, rate limits, and degradation strategies.

## Classification System

- **A-class**: OAuth-first platforms with rich authenticated API access
- **B-class**: Public API or export-based platforms (minimal/no auth required)
- **C-class**: Active sharing mechanisms (user-initiated URL sharing)

## Capability Matrix

| Platform | Tier | Auth Type | OAuth Scopes | Rate Limits | Status | Fallback Strategy | Terms of Service |
|----------|------|-----------|--------------|-------------|--------|-------------------|------------------|
| **Reddit** | A | OAuth 2.0 | `read`, `history`, `identity` | 60 RPM (OAuth authenticated) | Available | Auth revoked → URL import<br>Rate limit → Queue retry<br>Permission denied → Skip | [reddit.com/policies](https://www.redditinc.com/policies) |
| **Threads** | A | OAuth 2.0 | `threads_basic`, `threads_content_publish` | Rate-limited (no published numbers, free tier) | Available | Auth revoked → URL import<br>Rate limit → Exponential backoff<br>Permission denied → Skip | [developers.facebook.com/terms](https://developers.facebook.com/terms) |
| **Substack** | A | OAuth 2.1 | `mcp:read` (analytics only, Bestseller tier) | Not documented | Conditional | Auth revoked → URL import<br>Rate limit → Queue retry<br>Permission denied → Public scraping | [substack.com/tos](https://substack.com/tos) |
| **Medium** | A | OAuth 2.0 | `basicProfile`, `publishPost` (deprecated) | N/A (API shut down) | Unavailable | All requests → URL import or paste | [medium.com/policy/medium-terms-of-service](https://medium.com/policy/medium-terms-of-service) |
| **X (Twitter)** | A | OAuth 2.0 | `tweet.read`, `users.read`, `bookmark.read` | Pay-per-use: $0.001/read, 2M reads/month cap | Conditional | Auth revoked → URL import<br>Rate limit → Exponential backoff<br>Permission denied → Skip | [twitter.com/tos](https://twitter.com/tos) |
| **Hacker News** | B | None | N/A | No published limit (Firebase-backed) | Available | Rate limit → Exponential backoff<br>Content unavailable → Skip | [ycombinator.com/legal](https://www.ycombinator.com/legal/) |
| **Goodreads** | B | OAuth 1.0a | Various (for existing keys only) | Not documented | Requires Approval | Auth revoked → Export file import<br>API unavailable → Manual export | [goodreads.com/about/terms](https://www.goodreads.com/about/terms) |
| **The StoryGraph** | B | Public scraping | N/A | No official API | Conditional | Scraping blocked → Export file import<br>Private profile → Skip | [thestorygraph.com/terms-of-use](https://thestorygraph.com/terms-of-use) |
| **Quora** | C | None | N/A | No API | Conditional | Share link → URL import<br>Paywalled content → Skip | [quora.com/about/tos](https://www.quora.com/about/tos) |

## Detailed Platform Analysis

### A-Class Platforms (OAuth-First)

#### Reddit
- **Authorization**: OAuth 2.0 with standard authorization code flow
- **Key Scopes**: 
  - `read` - Read posts and comments
  - `history` - Access reading history
  - `identity` - User identity and profile
- **Rate Limits**: 60 requests per minute for OAuth-authenticated requests (conservative estimate; some sources cite 100 QPM averaged over 10 minutes)
- **Refresh Token Support**: Yes
- **Current Status**: ✅ Available - Active API with straightforward OAuth implementation
- **V3 User-Provided API Key**: Reddit OAuth supports user-provided `client_id` and `client_secret` for personal use applications. This is allowed per Reddit's API terms for individual developers.
- **Documentation**: [reddit.com/dev/api](https://www.reddit.com/dev/api)

#### Threads (Meta)
- **Authorization**: OAuth 2.0 via Facebook/Meta developer platform
- **Key Scopes**:
  - `threads_basic` - Basic profile access
  - `threads_content_publish` - Read published content
- **Rate Limits**: Free tier with undocumented rate limiting; Meta states "rate-limited" but no specific numbers published
- **Refresh Token Support**: Yes (short-lived + long-lived token pattern)
- **Current Status**: ✅ Available - Active API, free access
- **Documentation**: [developers.facebook.com/docs/threads](https://developers.facebook.com/docs/threads)

#### Substack
- **Authorization**: OAuth 2.1 (official MCP server) or community tools (unofficial)
- **Key Scopes**:
  - `mcp:read` - Analytics access (official, gated to Bestseller publications)
  - Community tools provide broader read access via undocumented endpoints
- **Rate Limits**: Not documented
- **Refresh Token Support**: Yes (for official OAuth)
- **Current Status**: ⚠️ Conditional - Official API limited to analytics; community tools work but unstable
- **Recommendation**: Implement fallback to public scraping for non-Bestseller publications
- **Documentation**: Official MCP server at `mcp.substack.com/api/v1/mcp`; community tools on GitHub

#### Medium
- **Authorization**: OAuth 2.0 (deprecated - no new tokens issued)
- **Key Scopes**: `basicProfile`, `publishPost` (historical only)
- **Rate Limits**: N/A
- **Current Status**: ❌ Unavailable - API officially shut down, no new integrations accepted
- **Recommendation**: URL import only; do not implement OAuth flow
- **Documentation**: [github.com/Medium/medium-api-docs](https://github.com/Medium/medium-api-docs) (archived)

#### X (Twitter)
- **Authorization**: OAuth 2.0
- **Key Scopes**:
  - `tweet.read` - Read tweets/posts
  - `users.read` - User profile information
  - `bookmark.read` - Bookmarked content
- **Rate Limits**: Pay-per-use model - $0.001 per Post read, capped at 2 million reads/month
- **Pricing**: No free tier for read access as of 2026
- **Current Status**: ⚠️ Conditional - Available but requires payment; cost must be disclosed to users
- **Recommendation**: Implement only if budget allocated; otherwise URL import only
- **Documentation**: [docs.x.com/x-api](https://docs.x.com/x-api)

### B-Class Platforms (Public API / Export)

#### Hacker News
- **Authorization**: None required
- **API Type**: Public REST API (Firebase-backed) + Algolia search API
- **Endpoints**:
  - `https://hacker-news.firebaseio.com/v0/` - Real-time item/user data
  - `https://hn.algolia.com/api/v1/` - Full-text search
- **Rate Limits**: No published limit; Firebase standard rate limits apply
- **Current Status**: ✅ Available - Fully public, stable API
- **Documentation**: [github.com/HackerNews/API](https://github.com/HackerNews/API)

#### Goodreads
- **Authorization**: OAuth 1.0a (for existing API keys only)
- **API Key Status**: No new keys issued; existing keys still functional
- **Export Alternative**: Users can export their own reading list via Profile → Manage Account → Export
- **Rate Limits**: Not documented
- **Current Status**: ⚠️ Requires Approval - Only viable for users with existing API keys; new users must use export files
- **Recommendation**: Support CSV import from Goodreads export; do not implement OAuth for new users
- **Documentation**: Historical API docs available; focus on export format

#### The StoryGraph
- **Authorization**: None (no official API)
- **Access Method**: Public profile scraping (user must set profile to public)
- **Export Alternative**: Profile → Manage Account → Export StoryGraph Library
- **Community Tools**: Several GitHub projects provide scraping-based pseudo-APIs
- **Current Status**: ⚠️ Conditional - Scraping is fragile and may break; export file more reliable
- **Recommendation**: Primary path is CSV import from export; scraping as optional enhancement
- **Documentation**: Community tools at [github.com/xdesro/storygraph-api](https://github.com/xdesro/storygraph-api)

### C-Class Platforms (Active Sharing)

#### Quora
- **Authorization**: None (no API)
- **Access Method**: Share links generated by users via Quora's Share button
- **Content Access**: Public content only; paywalled/private Spaces are restricted
- **Current Status**: ⚠️ Conditional - Relies on user providing share link; no programmatic discovery
- **Recommendation**: URL import only; parse Quora share URLs when user pastes them
- **Documentation**: No API documentation; URL parsing implementation required

## Gate V10 Validation Results

### Requirement: 2 A-Class OAuth Available OR 5 B/C-Class Available

**A-Class OAuth Status**:
- ✅ Reddit - Available, stable OAuth 2.0
- ✅ Threads - Available, free OAuth 2.0
- ⚠️ Substack - Conditional (analytics only via official; community tools available)
- ❌ Medium - Unavailable (API shut down)
- ⚠️ X/Twitter - Conditional (paid only, $0.001/read)

**Result**: **2 A-class platforms fully available (Reddit + Threads)** ✅

**B/C-Class Status**:
- ✅ Hacker News (B) - Available, public API
- ⚠️ Goodreads (B) - Requires existing API key OR export file
- ⚠️ StoryGraph (B) - Export file reliable; scraping conditional
- ⚠️ Quora (C) - URL import only

**Result**: **1 B-class fully available, 3 B/C-class conditional**

### Gate Status: ✅ PASSED

The V10 requirement is satisfied with **2 A-class platforms (Reddit + Threads)** providing OAuth-based authenticated access.

## Degradation Path Summary

For all platforms, the following fallback hierarchy applies:

1. **Primary**: OAuth or public API (where available)
2. **Secondary**: Public scraping or export file import (where applicable)
3. **Tertiary**: URL import - user pastes article URL
4. **Final**: Manual paste - user copies article text directly

All platforms support at least the Tertiary (URL import) fallback, ensuring no platform failure blocks user access to content.

## Implementation Notes

### Token Storage Requirements
- **Client-side**: Only short-lived JWT session tokens (1-hour expiration)
- **Server-side**: Long-lived OAuth refresh tokens, encrypted at rest
- **Logging**: Token values never logged; only `token_prefix` (first 8 chars) for debugging

### Rate Limit Handling
- All platforms implement exponential backoff on 429 responses
- Queue-based retry for platforms with known rate windows (Reddit: 1 minute)
- User notification when rate limit exceeded with estimated retry time

### Security Constraints
- No password collection (OAuth only)
- No bypass of login/follow walls
- Content restricted to what the authenticated user can access via official means
- Reddit V3 user-provided API keys: Allowed (user's own credentials for personal use)

## References

Platform research conducted 2026-09-11 using official documentation and community resources:
- Reddit API: [support.reddithelp.com/hc/en-us/articles/16160319875092](https://support.reddithelp.com/hc/en-us/articles/16160319875092)
- Threads API: [developers.facebook.com/docs/threads](https://developers.facebook.com/docs/threads)
- Substack unofficial API: [github.com/AnthonyDavidAdams/substack-api-reference](https://github.com/AnthonyDavidAdams/substack-api-reference)
- Medium API status: [github.com/Medium/medium-api-docs](https://github.com/Medium/medium-api-docs)
- X API: [docs.x.com/x-api](https://docs.x.com/x-api)
- Hacker News API: [github.com/HackerNews/API](https://github.com/HackerNews/API)
- Goodreads API: [github.com/karlicoss/goodrexport](https://github.com/karlicoss/goodrexport)
- StoryGraph: [github.com/xdesro/storygraph-api](https://github.com/xdesro/storygraph-api)
