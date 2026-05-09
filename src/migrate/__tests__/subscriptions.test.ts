import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { migrateSubscriptions } from '../subscriptions.js';
import { withRetry } from '../../api/retry.js';
import type { ApiResult } from '../../types/index.js';

// Mock the retry module to avoid real delays
vi.mock('../../api/retry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/retry.js')>();
  return {
    ...actual,
    delay: vi.fn().mockResolvedValue(undefined),
    withRetry: vi.fn(),
  };
});

describe('migrateSubscriptions', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockYoutube: any;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    
    mockYoutube = {
      subscriptions: {
        insert: vi.fn(),
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('migrates subscriptions successfully', async () => {
    const subscriptions = [
      { channelId: 'UC1', channelTitle: 'Chan 1', channelUrl: 'url1' },
      { channelId: 'UC2', channelTitle: 'Chan 2', channelUrl: 'url2' },
    ];

    vi.mocked(withRetry).mockResolvedValue({ status: 'success', data: {} } as ApiResult<unknown>);

    await migrateSubscriptions(mockYoutube, subscriptions);

    expect(withRetry).toHaveBeenCalledTimes(2);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('2 added, 0 skipped, 0 failed'));
  });

  it('handles duplicates', async () => {
    const subscriptions = [{ channelId: 'UC1', channelTitle: 'Chan 1', channelUrl: 'url1' }];

    vi.mocked(withRetry).mockResolvedValue({ status: 'duplicate' } as ApiResult<unknown>);

    await migrateSubscriptions(mockYoutube, subscriptions);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('0 added, 1 skipped, 0 failed'));
  });

  it('handles failures', async () => {
    const subscriptions = [{ channelId: 'UC1', channelTitle: 'Chan 1', channelUrl: 'url1' }];

    vi.mocked(withRetry).mockResolvedValue({ status: 'failed', error: new Error('fail') } as ApiResult<unknown>);

    await migrateSubscriptions(mockYoutube, subscriptions);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('0 added, 0 skipped, 1 failed'));
  });
});
