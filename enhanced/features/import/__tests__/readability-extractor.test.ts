/**
 * Readability Extractor Security Tests
 * Tests HTML sanitization and XSS prevention
 */

import { sanitizeUserContent } from '../readability-extractor';

describe('HTML Sanitization - XSS Prevention', () => {
  test('removes script tags', () => {
    const malicious = '<p>Hello</p><script>alert("xss")</script>';
    const clean = sanitizeUserContent(malicious);
    expect(clean).not.toContain('<script>');
    expect(clean).not.toContain('alert');
    expect(clean).toContain('Hello');
  });

  test('removes event handlers from img tags', () => {
    const malicious = '<img src="x" onerror="alert(1)">';
    const clean = sanitizeUserContent(malicious);
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('alert');
  });

  test('removes onclick handlers', () => {
    const malicious = '<a href="#" onclick="evil()">Click</a>';
    const clean = sanitizeUserContent(malicious);
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('evil');
    expect(clean).toContain('Click');
  });

  test('sanitizes javascript: URLs in links', () => {
    const malicious = '<a href="javascript:alert(1)">Link</a>';
    const clean = sanitizeUserContent(malicious);
    expect(clean).not.toContain('javascript:');
  });

  test('removes iframe tags', () => {
    const malicious = '<p>Text</p><iframe src="https://evil.com"></iframe>';
    const clean = sanitizeUserContent(malicious);
    expect(clean).not.toContain('iframe');
    expect(clean).toContain('Text');
  });

  test('removes object and embed tags', () => {
    const malicious = '<object data="evil.swf"></object><embed src="bad.swf">';
    const clean = sanitizeUserContent(malicious);
    expect(clean).not.toContain('object');
    expect(clean).not.toContain('embed');
  });

  test('preserves safe HTML structure', () => {
    const safe = '<h1>Title</h1><p>Paragraph with <strong>bold</strong> and <em>italic</em>.</p>';
    const clean = sanitizeUserContent(safe);
    expect(clean).toContain('<h1>');
    expect(clean).toContain('<p>');
    expect(clean).toContain('<strong>');
    expect(clean).toContain('<em>');
  });

  test('preserves links with safe URLs', () => {
    const safe = '<a href="https://example.com">Link</a>';
    const clean = sanitizeUserContent(safe);
    expect(clean).toContain('href="https://example.com"');
    expect(clean).toContain('Link');
  });

  test('preserves images with safe attributes', () => {
    const safe = '<img src="https://example.com/image.jpg" alt="Description">';
    const clean = sanitizeUserContent(safe);
    expect(clean).toContain('src="https://example.com/image.jpg"');
    expect(clean).toContain('alt="Description"');
  });
});
