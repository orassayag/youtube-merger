import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, delay } from '../retry.js';

describe('retry utils', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('delay', () => {
    it('resolves after specified time', async () => {
      const promise = delay(100);
      vi.advanceTimersByTime(100);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('withRetry', () => {
    it('returns success with data', async () => {
      const r = await withRetry(async () => ({ id: 'x' }), 'op');
      expect(r).toEqual({ status: 'success', data: { id: 'x' } });
    });

    it('returns duplicate on HTTP 409', async () => {
      const err = { response: { status: 409 } };
      const r = await withRetry(async () => Promise.reject(err), 'op', 1);
      expect(r).toEqual({ status: 'duplicate' });
    });

    it('retries on 403 quota error after 60s', async () => {
      let calls = 0;
      const fn = async () => {
        calls++;
        if (calls === 1) throw { response: { status: 403 } };
        return 'ok';
      };

      const promise = withRetry(fn, 'op', 2);
      
      // Wait for first attempt and 403 check
      await vi.runAllTimersAsync();
      
      const r = await promise;
      expect(r).toEqual({ status: 'success', data: 'ok' });
      expect(calls).toBe(2);
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Quota exceeded'));
    });

    it('retries on generic error after 2s', async () => {
      let calls = 0;
      const fn = async () => {
        calls++;
        if (calls === 1) throw new Error('fail');
        return 'ok';
      };

      const promise = withRetry(fn, 'op', 2);
      await vi.runAllTimersAsync();
      
      const r = await promise;
      expect(r).toEqual({ status: 'success', data: 'ok' });
      expect(calls).toBe(2);
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Error on "op" (attempt 1): fail'));
    });

    it('returns failed after all retries exhausted', async () => {
      const err = new Error('dead');
      const fn = async () => { throw err; };

      const promise = withRetry(fn, 'op', 2);
      await vi.runAllTimersAsync();
      
      const r = await promise;
      expect(r).toEqual({ status: 'failed', error: err });
    });

    it('handles non-Error objects in error message', async () => {
      const fn = async () => { throw 'string error'; };
      const promise = withRetry(fn, 'op', 1);
      await vi.runAllTimersAsync();
      const r = await promise;
      expect(r.status).toBe('failed');
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('string error'));
    });

    it('handles null/undefined response in getErrorStatus', async () => {
      const fn = async () => { throw { response: null }; };
      const promise = withRetry(fn, 'op', 1);
      await vi.runAllTimersAsync();
      const r = await promise;
      expect(r.status).toBe('failed');
    });
  });
});
