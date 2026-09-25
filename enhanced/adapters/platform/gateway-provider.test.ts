import { describe, expect, it, vi } from 'vitest';
import { GatewayPlatformProvider } from './gateway-provider';
import type { PlatformCapability } from './types';

const capability: PlatformCapability = {
  platform_id: 'reddit',
  display_name: 'Reddit',
  tier: 'A',
  auth_type: 'oauth2',
  rate_limits: {},
  status: 'available',
  status_notes: 'gateway',
  fallback_strategy: {
    on_auth_revoked: 'url_import',
    on_rate_limit: 'queue_retry',
    on_permission_denied: 'skip',
  },
  tos_url: 'https://www.redditinc.com/policies/user-agreement',
};

describe('GatewayPlatformProvider', () => {
  it('keeps session tokens in memory and maps gateway responses', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: 'https://reddit.com/oauth' } }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: {
              platform: 'reddit',
              content_id: 'abc',
              title: 'Title',
              author: 'user',
              text: 'Text',
              published_at: '2026-01-01T00:00:00Z',
              url: 'https://reddit.com/abc',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    const provider = new GatewayPlatformProvider({
      capability,
      gatewayUrl: 'https://gateway.test',
      fetchImpl,
    });

    await expect(provider.authorize('readest://oauth')).resolves.toBe('https://reddit.com/oauth');
    provider.setSessionToken('short-lived');
    await expect(provider.fetchContent('', 'https://reddit.com/abc')).resolves.toMatchObject({
      title: 'Title',
    });
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({
      headers: { Authorization: 'Bearer short-lived' },
    });
  });

  it('rejects missing session tokens and clears on revoke', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const provider = new GatewayPlatformProvider({ capability, fetchImpl });
    await expect(provider.fetchContent('', 'abc')).rejects.toThrow('session token');
    provider.setSessionToken('token');
    await provider.revoke('token');
    await expect(provider.fetchContent('', 'abc')).rejects.toThrow('session token');
  });
});
