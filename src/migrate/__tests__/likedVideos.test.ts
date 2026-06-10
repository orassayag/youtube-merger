import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { migrateLikedVideos } from '../index.js';
import { withRetry } from '../../api/index.js';
import { parseLikedVideos } from '../../parsers/index.js';
import type { ApiResult } from '../../types/index.js';

vi.mock('../../api/retry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/retry.js')>();
  return {
    ...actual,
    delay: vi.fn().mockResolvedValue(undefined),
    withRetry: vi.fn(),
  };
});

vi.mock('../../parsers/takeoutCsv.js', () => ({
  parseLikedVideos: vi.fn(),
}));

describe('migrateLikedVideos', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockYoutube: any;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mockYoutube = {
      videos: {
        rate: vi.fn(),
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('migrates liked videos successfully', async () => {
    vi.mocked(parseLikedVideos).mockReturnValue(['v1', 'v2']);
    vi.mocked(withRetry).mockResolvedValue({
      status: 'success',
    } as ApiResult<unknown>);

    await migrateLikedVideos(mockYoutube);

    expect(withRetry).toHaveBeenCalledTimes(2);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('2/2 videos liked')
    );
  });

  it('handles no liked videos', async () => {
    vi.mocked(parseLikedVideos).mockReturnValue([]);

    await migrateLikedVideos(mockYoutube);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('No liked videos to migrate')
    );
  });

  it('handles duplicates and failures', async () => {
    vi.mocked(parseLikedVideos).mockReturnValue(['v1', 'v2']);
    vi.mocked(withRetry)
      .mockResolvedValueOnce({ status: 'duplicate' } as ApiResult<unknown>)
      .mockResolvedValueOnce({ status: 'failed' } as ApiResult<unknown>);

    await migrateLikedVideos(mockYoutube);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('0/2 videos liked (1 skip, 1 failed)')
    );
  });
});
