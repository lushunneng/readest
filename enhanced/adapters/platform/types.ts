/**
 * Platform Adapter Type Definitions
 *
 * Contract Version: 1.0.0
 * Phase: 0 (Foundation - Interface Design)
 *
 * Defines platform capability levels, authorization types, and provider contracts
 * for the 9-platform integration system.
 */

/**
 * Platform capability tier classification
 *
 * A-class: OAuth-first platforms with rich authenticated access
 * B-class: Public API or export-based platforms
 * C-class: Active sharing mechanisms (user-initiated)
 */
export type PlatformTier = 'A' | 'B' | 'C';

/**
 * Authorization mechanisms supported across platforms
 */
export type AuthorizationType =
  | 'oauth2' // OAuth 2.0/2.1 flow
  | 'api_key' // User-provided API key
  | 'public_scraping' // Public profile/content scraping
  | 'none'; // No authentication required

/**
 * Platform capability descriptor
 *
 * Defines what a platform can do, its authorization requirements,
 * rate limits, and degradation paths.
 */
export interface PlatformCapability {
  /** Platform identifier */
  platform_id: string;

  /** Display name */
  display_name: string;

  /** Capability tier */
  tier: PlatformTier;

  /** Primary authorization method */
  auth_type: AuthorizationType;

  /** OAuth 2.0 scopes required (if auth_type is oauth2) */
  oauth_scopes?: string[];

  /** Rate limit configuration */
  rate_limits: {
    /** Requests per minute */
    requests_per_minute?: number;

    /** Requests per hour */
    requests_per_hour?: number;

    /** Requests per day */
    requests_per_day?: number;

    /** Additional notes on rate limiting */
    notes?: string;
  };

  /** Current availability status */
  status: 'available' | 'conditional' | 'unavailable' | 'requires_approval';

  /** Status explanation */
  status_notes: string;

  /** Degradation strategy when primary method fails */
  fallback_strategy: {
    /** Authorization revoked → URL import */
    on_auth_revoked: 'url_import' | 'paste_content' | 'disable';

    /** Rate limit exceeded → queue/retry */
    on_rate_limit: 'queue_retry' | 'exponential_backoff' | 'disable';

    /** Permission denied (e.g., private content) */
    on_permission_denied: 'url_import' | 'paste_content' | 'skip';
  };

  /** Terms of Service URL */
  tos_url: string;

  /** API documentation URL */
  docs_url?: string;
}

/**
 * Platform provider interface
 *
 * All platform adapters must implement this contract.
 * Phase 0: Interface definition only (implementation by agent-import-platform)
 */
export interface PlatformProvider {
  /** Platform capability descriptor */
  readonly capability: PlatformCapability;

  /**
   * Initiate OAuth authorization flow
   *
   * @param redirectUri - Server callback URI
   * @returns Authorization URL to redirect user to
   * @throws Error if platform does not support OAuth
   */
  authorize(redirectUri: string): Promise<string>;

  /**
   * Fetch content from platform using authorized session
   *
   * @param sessionToken - Short-lived JWT session token from server
   * @param contentId - Platform-specific content identifier (URL, post ID, etc.)
   * @returns Content metadata and text
   */
  fetchContent(sessionToken: string, contentId: string): Promise<PlatformContent>;

  /**
   * Refresh expired access token (server-side operation)
   *
   * @param refreshToken - Long-lived refresh token (server-side only)
   * @returns New access token
   */
  refreshToken(refreshToken: string): Promise<string>;

  /**
   * Revoke authorization and clean up tokens
   *
   * @param sessionToken - Session token to revoke
   */
  revoke(sessionToken: string): Promise<void>;
}

/**
 * Content fetched from a platform
 */
export interface PlatformContent {
  /** Platform identifier */
  platform: string;

  /** Platform-specific content ID */
  content_id: string;

  /** Content title/headline */
  title: string;

  /** Content author */
  author: string;

  /** Plain text content */
  text: string;

  /** Publication timestamp (ISO 8601) */
  published_at: string;

  /** Canonical URL */
  url: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * OAuth server configuration
 *
 * Server-side token storage configuration for oauth.miapikey.com
 */
export interface OAuthServerConfig {
  /** Server base URL */
  server_url: string;

  /** JWT session token expiration (seconds) */
  session_token_ttl: number;

  /** Token encryption key (environment variable reference) */
  encryption_key_env: string;

  /** Database connection for token storage */
  database_url_env: string;
}

/**
 * Platform import request
 *
 * User-initiated content import from a platform
 */
export interface PlatformImportRequest {
  /** Target platform */
  platform: string;

  /** Content identifier (URL, post ID, username, etc.) */
  content_id: string;

  /** Import type */
  import_type: 'article' | 'reading_list' | 'bookmarks' | 'public_profile';

  /** Optional: session token if user is authenticated */
  session_token?: string;
}

/**
 * Platform import result
 */
export interface PlatformImportResult {
  /** Success status */
  success: boolean;

  /** Imported content (if successful) */
  content?: PlatformContent[];

  /** Error details (if failed) */
  error?: {
    code: string;
    message: string;
    fallback_suggestion: string;
  };
}
