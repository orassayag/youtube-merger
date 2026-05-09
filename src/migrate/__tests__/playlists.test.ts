import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { migratePlaylists } from '../playlists.js';
import { withRetry } from '../../api/retry.js';
import { parsePlaylists } from '../../parsers/takeoutCsv.js';
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
  parsePlaylists: vi.fn(),
}));

describe('migratePlaylists', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockYoutube: any;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    
    mockYoutube = {
      playlists: {
        insert: vi.fn(),
      },
      playlistItems: {
        insert: vi.fn(),
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('migrates playlists successfully', async () => {
    const playlists = new Map([['PL1', ['v1', 'v2']]]);
    vi.mocked(parsePlaylists).mockReturnValue(playlists);
    
    // First call to withRetry: create playlist
    vi.mocked(withRetry)
      .mockResolvedValueOnce({ 
        status: 'success', 
        data: { data: { id: 'new_pl_id' } } 
      } as ApiResult<unknown>)
      // Subsequent calls: add videos
      .mockResolvedValue({ status: 'success', data: {} } as ApiResult<unknown>);

    await migratePlaylists(mockYoutube);

    expect(withRetry).toHaveBeenCalledTimes(3); // 1 create + 2 add
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"PL1": 2/2 videos added'));
  });

  it('handles no playlists', async () => {
    vi.mocked(parsePlaylists).mockReturnValue(new Map());

    await migratePlaylists(mockYoutube);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No playlists to migrate'));
  });

  it('handles playlist creation failure', async () => {
    const playlists = new Map([['PL1', ['v1']]]);
    vi.mocked(parsePlaylists).mockReturnValue(playlists);
    
    vi.mocked(withRetry).mockResolvedValue({ 
      status: 'failed', 
      error: new Error('fail') 
    } as ApiResult<unknown>);

    await migratePlaylists(mockYoutube);

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Could not create playlist "PL1"'));
  });

  it('handles duplicates and failures when adding videos', async () => {
    const playlists = new Map([['PL1', ['v1', 'v2', 'v3']]]);
    vi.mocked(parsePlaylists).mockReturnValue(playlists);
    
    vi.mocked(withRetry)
      .mockResolvedValueOnce({ 
        status: 'success', 
        data: { data: { id: 'pl_id' } } 
      } as ApiResult<unknown>)
      .mockResolvedValueOnce({ status: 'success', data: {} } as ApiResult<unknown>)
      .mockResolvedValueOnce({ status: 'duplicate' } as ApiResult<unknown>)
      .mockResolvedValueOnce({ 
        status: 'failed', 
        error: new Error('fail') 
      } as ApiResult<unknown>);

    await migratePlaylists(mockYoutube);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"PL1": 1/3 videos added (1 dup, 1 failed)'));
  });
});
