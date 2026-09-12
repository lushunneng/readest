/**
 * URL Security Validator
 *
 * Prevents SSRF attacks, resource abuse, and malicious URL patterns
 * Contract Version: 1.0.0
 */

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
  normalizedUrl?: string;
}

const PRIVATE_IP_RANGES = [
  /^127\./, // Loopback
  /^10\./, // Private Class A
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private Class B
  /^192\.168\./, // Private Class C
  /^169\.254\./, // Link-local
  /^::1$/, // IPv6 loopback
  /^fe80:/, // IPv6 link-local
  /^fc00:/, // IPv6 unique local
];

const BLOCKED_HOSTS = [
  'localhost',
  'metadata.google.internal', // GCP metadata
  '169.254.169.254', // AWS/Azure metadata
];

const MAX_CONTENT_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

/**
 * Validate URL for security and resource constraints
 */
export async function validateUrl(urlString: string): Promise<UrlValidationResult> {
  let url: URL;

  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Protocol check
  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
    return { valid: false, error: `Protocol ${url.protocol} not allowed` };
  }

  // Blocked hostname check
  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.includes(hostname)) {
    return { valid: false, error: 'Access to this host is blocked' };
  }

  // Private IP range check
  for (const pattern of PRIVATE_IP_RANGES) {
    if (pattern.test(hostname)) {
      return { valid: false, error: 'Access to private IP ranges is blocked (SSRF prevention)' };
    }
  }

  return {
    valid: true,
    normalizedUrl: url.toString(),
  };
}

/**
 * Fetch URL with security constraints and size limits
 */
export async function secureFetch(url: string): Promise<{ content: string; contentType: string }> {
  const validation = await validateUrl(url);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const response = await fetch(validation.normalizedUrl!, {
    headers: {
      'User-Agent': 'Readest/1.0 (Article Import)',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000), // 30 second timeout
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';

  // Content-Type validation
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
    throw new Error(`Unsupported content type: ${contentType}`);
  }

  // Size check
  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > MAX_CONTENT_SIZE) {
    throw new Error(`Content size ${contentLength} exceeds maximum ${MAX_CONTENT_SIZE} bytes`);
  }

  const content = await response.text();

  if (content.length > MAX_CONTENT_SIZE) {
    throw new Error(`Content size ${content.length} exceeds maximum ${MAX_CONTENT_SIZE} bytes`);
  }

  return { content, contentType };
}
