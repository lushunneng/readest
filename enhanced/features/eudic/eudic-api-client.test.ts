import { afterEach, describe, expect, it, vi } from 'vitest';
import { EudicApiClient } from './eudic-api-client';

describe('EudicApiClient', () => {
  afterEach(() => vi.restoreAllMocks());

  it('posts words in the Open API request shape', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 201 }));

    await new EudicApiClient('token').addWords([{ word: '  example  ' }], '42', 'en');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.frdic.com/api/open/v1/studylist/words',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ category_id: '42', language: 'en', words: ['example'] }),
      }),
    );
  });
});
