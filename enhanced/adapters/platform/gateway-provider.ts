import type { PlatformCapability, PlatformContent, PlatformProvider } from './types';

export interface GatewayProviderOptions {
  capability: PlatformCapability;
  gatewayUrl?: string;
  fetchImpl?: typeof fetch;
}

interface GatewayContentResponse {
  content: PlatformContent;
}

interface GatewaySessionResponse {
  session_token: string;
  expires_in: number;
}

/**
 * Client side adapter for the server owned OAuth gateway.
 * Long lived provider tokens never cross this boundary or enter storage.
 */
export class GatewayPlatformProvider implements PlatformProvider {
  readonly capability: PlatformCapability;
  readonly #gatewayUrl: string;
  readonly #fetch: typeof fetch;
  #sessionToken: string | null = null;

  constructor(options: GatewayProviderOptions) {
    this.capability = options.capability;
    this.#gatewayUrl = (options.gatewayUrl ?? 'https://oauth.miapikey.com').replace(/\/$/, '');
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async authorize(redirectUri: string): Promise<string> {
    const url = new URL(
      `/auth/${encodeURIComponent(this.capability.platform_id)}/authorize`,
      this.#gatewayUrl,
    );
    url.searchParams.set('redirect_uri', redirectUri);
    const response = await this.#fetch(url, { method: 'GET', redirect: 'manual' });
    if (response.status < 300 || response.status >= 400) {
      throw new Error(`OAuth authorization failed (${response.status})`);
    }
    const location = response.headers.get('location');
    if (!location) throw new Error('OAuth gateway did not return an authorization URL');
    return location;
  }

  setSessionToken(token: string): void {
    if (!token.trim()) throw new Error('Session token cannot be empty');
    this.#sessionToken = token;
  }

  clearSessionToken(): void {
    this.#sessionToken = null;
  }

  async fetchContent(sessionToken: string, contentId: string): Promise<PlatformContent> {
    const token = sessionToken || this.#sessionToken;
    if (!token) throw new Error('A short-lived session token is required');
    const url = new URL(
      `/api/${encodeURIComponent(this.capability.platform_id)}/content`,
      this.#gatewayUrl,
    );
    url.searchParams.set('url', contentId);
    const response = await this.#fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Content fetch failed (${response.status})`);
    const body = (await response.json()) as GatewayContentResponse;
    if (!body.content?.text || !body.content.url)
      throw new Error('Gateway returned invalid content');
    return body.content;
  }

  async refreshToken(refreshToken: string): Promise<string> {
    if (!refreshToken.trim()) throw new Error('Refresh token cannot be empty');
    const response = await this.#fetch(
      `${this.#gatewayUrl}/auth/${encodeURIComponent(this.capability.platform_id)}/refresh`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      },
    );
    if (!response.ok) throw new Error(`Session refresh failed (${response.status})`);
    const body = (await response.json()) as GatewaySessionResponse;
    if (!body.session_token) throw new Error('Gateway returned no session token');
    this.#sessionToken = body.session_token;
    return body.session_token;
  }

  async revoke(sessionToken: string): Promise<void> {
    const token = sessionToken || this.#sessionToken;
    if (!token) return;
    const response = await this.#fetch(
      `${this.#gatewayUrl}/auth/${encodeURIComponent(this.capability.platform_id)}/revoke`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!response.ok) throw new Error(`OAuth revoke failed (${response.status})`);
    this.clearSessionToken();
  }
}
