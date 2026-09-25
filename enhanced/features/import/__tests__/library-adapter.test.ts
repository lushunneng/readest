import { readFileSync, rmSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { importArticleToLibrary } from '../library-adapter';
import type { LibraryPort } from '../../../core/ports';

describe('Library article adapter', () => {
  it('creates a readable EPUB package instead of a marker XHTML file', async () => {
    let importedPath = '';
    const library: LibraryPort = {
      importBook: async (file) => {
        importedPath = String(file);
        return {
          hash: 'hash',
          title: 'Test article',
          author: 'Author',
          format: 'epub',
          filePath: importedPath,
        };
      },
      getBookMetadata: async () => {
        throw new Error('unused');
      },
      listBooks: async () => [],
    };

    await importArticleToLibrary(
      library,
      {
        content_id: 'article-test',
        source: 'https://example.com/article',
        cfi: 'epubcfi(/6/2!/4/2:0)',
        text: 'A paragraph from the article.',
        section_index: 0,
        content_version: 'v1',
        permission_status: 'granted',
      },
      { title: 'Test article', author: 'Author' },
    );

    const entries = unzipSync(new Uint8Array(readFileSync(importedPath)));
    expect(strFromU8(entries.mimetype)).toBe('application/epub+zip');
    expect(strFromU8(entries['OEBPS/content.opf'])).toContain('<dc:title>Test article</dc:title>');
    expect(strFromU8(entries['OEBPS/content.xhtml'])).toContain('A paragraph from the article.');
    rmSync(importedPath, { force: true });
  });
});
