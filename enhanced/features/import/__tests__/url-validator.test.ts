/**
 * URL Validator Security Tests
 * Tests SSRF prevention and resource abuse protection
 */

import { validateUrl } from '../url-validator';

describe('URL Validator - SSRF Prevention', () => {
  test('blocks localhost', async () => {
    const result = await validateUrl('http://localhost:8080/admin');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('blocked');
  });

  test('blocks 127.0.0.1', async () => {
    const result = await validateUrl('http://127.0.0.1/secret');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('private IP');
  });

  test('blocks private Class A network (10.x.x.x)', async () => {
    const result = await validateUrl('http://10.0.0.1/internal');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('private IP');
  });

  test('blocks private Class B network (172.16-31.x.x)', async () => {
    const result = await validateUrl('http://172.16.0.1/admin');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('private IP');
  });

  test('blocks private Class C network (192.168.x.x)', async () => {
    const result = await validateUrl('http://192.168.1.1/router');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('private IP');
  });

  test('blocks link-local addresses (169.254.x.x)', async () => {
    const result = await validateUrl('http://169.254.169.254/metadata');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('blocked');
  });

  test('blocks cloud metadata endpoints', async () => {
    const result = await validateUrl('http://metadata.google.internal/');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('blocked');
  });

  test('allows valid public URLs', async () => {
    const result = await validateUrl('https://www.bbc.com/news/article');
    expect(result.valid).toBe(true);
    expect(result.normalizedUrl).toBe('https://www.bbc.com/news/article');
  });

  test('blocks non-HTTP protocols', async () => {
    const result = await validateUrl('file:///etc/passwd');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Protocol');
  });

  test('blocks javascript: URLs', async () => {
    const result = await validateUrl('javascript:alert(1)');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Protocol');
  });

  test('rejects malformed URLs', async () => {
    const result = await validateUrl('not a url at all');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid URL');
  });
});
