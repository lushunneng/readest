/**
 * Library Import Adapter
 *
 * Integrates article import with LibraryPort
 * Contract Version: 1.0.0
 */

import type { LibraryPort, BookHandle } from '../../core/ports';
import type { ArticleDocument } from '../../core/models';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { zipSync, strToU8 } from 'fflate';

/**
 * Convert ArticleDocument to minimal EPUB for library import
 *
 * Creates a minimal EPUB structure that Readest can open
 */
function createMinimalEpub(
  article: ArticleDocument,
  metadata: {
    title: string;
    author?: string;
    siteName?: string;
  },
): string {
  const tempDir = join(tmpdir(), `readest-article-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  const epubPath = join(tempDir, `${article.content_id}.epub`);

  const contentXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXml(metadata.title)}</title>
  <meta charset="utf-8"/>
</head>
<body>
  <article>
    <h1>${escapeXml(metadata.title)}</h1>
    ${metadata.author ? `<p class="byline">By ${escapeXml(metadata.author)}</p>` : ''}
    <div class="content">
      ${article.text
        .split('\n\n')
        .map((p) => `<p>${escapeXml(p)}</p>`)
        .join('\n')}
    </div>
    <footer>
      <p class="source">Source: <a href="${escapeXml(article.source)}">${escapeXml(article.source)}</a></p>
    </footer>
  </article>
</body>
</html>`;

  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;
  const packageOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${escapeXml(article.content_id)}</dc:identifier>
    <dc:title>${escapeXml(metadata.title)}</dc:title>
    <dc:creator>${escapeXml(metadata.author || 'Readest')}</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="content" href="content.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  </manifest>
  <spine><itemref idref="content"/></spine>
</package>`;

  // EPUB requires an uncompressed mimetype entry and a standard container.
  const epub = zipSync({
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(containerXml),
    'OEBPS/content.xhtml': strToU8(contentXhtml),
    'OEBPS/content.opf': strToU8(packageOpf),
  });
  writeFileSync(epubPath, epub);

  return epubPath;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Import article into Readest library
 */
export async function importArticleToLibrary(
  libraryPort: LibraryPort,
  article: ArticleDocument,
  metadata: {
    title: string;
    author?: string;
    siteName?: string;
  },
  options: {
    transient?: boolean;
  } = {},
): Promise<BookHandle | null> {
  try {
    // Create minimal EPUB representation
    const epubPath = createMinimalEpub(article, metadata);

    // Import through LibraryPort
    const bookHandle = await libraryPort.importBook(epubPath, {
      transient: options.transient ?? false,
    });

    return bookHandle;
  } catch (error) {
    console.error('Library import failed:', error);
    throw error;
  }
}

/**
 * Check for duplicate imports based on URL hash
 */
export async function checkDuplicateImport(
  libraryPort: LibraryPort,
  sourceUrl: string,
): Promise<BookHandle | null> {
  try {
    const books = await libraryPort.listBooks();

    // Check if any book has the same source URL
    // This is a simple check - in production, would use proper metadata storage
    const duplicate = books.find(
      (book) => book.filePath && book.filePath.includes(sourceUrl.replace(/[^a-zA-Z0-9]/g, '_')),
    );

    return duplicate || null;
  } catch (error) {
    console.error('Duplicate check failed:', error);
    return null;
  }
}
