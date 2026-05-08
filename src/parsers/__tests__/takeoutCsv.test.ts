import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parseSubscriptions, parsePlaylists, parseLikedVideos } from '../takeoutCsv.js';

describe('takeoutCsv parsers', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'yt-merge-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('parseSubscriptions', () => {
    it('reads Channel Id and title aliases', () => {
      mkdirSync(join(root, 'subscriptions'), { recursive: true });
      writeFileSync(
        join(root, 'subscriptions', 'subscriptions.csv'),
        'Channel Id,Channel Title,Channel Url\nUCabc,My Channel,https://youtube.com/channel/UCabc\n'
      );
      const subs = parseSubscriptions(root);
      expect(subs).toHaveLength(1);
      expect(subs[0].channelId).toBe('UCabc');
      expect(subs[0].channelTitle).toBe('My Channel');
    });

    it('handles lowercase aliases', () => {
      mkdirSync(join(root, 'subscriptions'), { recursive: true });
      writeFileSync(
        join(root, 'subscriptions', 'subscriptions.csv'),
        'channel_id,channel_title,channel_url\nUC123,Title,URL\n'
      );
      const subs = parseSubscriptions(root);
      expect(subs[0]).toEqual({
        channelId: 'UC123',
        channelTitle: 'Title',
        channelUrl: 'URL',
      });
    });

    it('returns empty array if file missing', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const subs = parseSubscriptions(root);
      expect(subs).toEqual([]);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('subscriptions.csv not found'),
        expect.anything()
      );
    });
  });

  describe('parsePlaylists', () => {
    it('skips liked and watch-later files', () => {
      const playlistsDir = join(root, 'playlists');
      mkdirSync(playlistsDir, { recursive: true });
      const header = 'x\nx\nx\n';
      const csvBody = 'Video Id\nvid1\n';
      writeFileSync(join(playlistsDir, 'My PL.csv'), header + csvBody);
      writeFileSync(join(playlistsDir, 'liked videos.csv'), header + 'Video Id\nv99\n');
      writeFileSync(join(playlistsDir, 'watch-later.csv'), header + 'Video Id\nv98\n');

      const map = parsePlaylists(root);
      expect(map.size).toBe(1);
      expect(map.get('My PL')).toEqual(['vid1']);
    });

    it('returns empty map if folder missing', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const map = parsePlaylists(root);
      expect(map.size).toBe(0);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('playlists/ folder not found'),
        expect.anything()
      );
    });

    it('handles malformed CSV', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const playlistsDir = join(root, 'playlists');
      mkdirSync(playlistsDir, { recursive: true });
      // This will fail because it expect columns but won't find them if there is no data at line 4
      writeFileSync(join(playlistsDir, 'bad.csv'), 'line1\nline2\nline3\ncol1,col2\ndata');

      parsePlaylists(root);
      // It might still create an entry if parse doesn't throw, but with empty/wrong data.
      // Actually if it doesn't throw, it will set an entry.
      // Let's make it throw by providing truly bad data that csv-parse can't handle.
      writeFileSync(join(playlistsDir, 'really_bad.csv'), 'a"b"c'); // Invalid quotes

      const map2 = parsePlaylists(root);
      expect(map2.size).toBe(0);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Could not parse really_bad.csv')
      );
    });
  });

  describe('parseLikedVideos', () => {
    it('finds liked csv and reads from_line 4', () => {
      const playlistsDir = join(root, 'playlists');
      mkdirSync(playlistsDir, { recursive: true });
      const content = 'line1\nline2\nline3\nVideo Id\nlike1\nlike2\n';
      writeFileSync(join(playlistsDir, 'Liked videos.csv'), content);

      const ids = parseLikedVideos(root);
      expect(ids).toEqual(['like1', 'like2']);
    });

    it('returns empty if folder missing', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const ids = parseLikedVideos(root);
      expect(ids).toEqual([]);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('playlists/ folder not found'),
        expect.anything()
      );
    });

    it('returns empty if no liked file found', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      mkdirSync(join(root, 'playlists'), { recursive: true });
      const ids = parseLikedVideos(root);
      expect(ids).toEqual([]);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Liked videos CSV not found')
      );
    });

    it('handles malformed CSV', () => {
      const playlistsDir = join(root, 'playlists');
      mkdirSync(playlistsDir, { recursive: true });
      writeFileSync(join(playlistsDir, 'Liked videos.csv'), 'bad\ncsv');
      const ids = parseLikedVideos(root);
      expect(ids).toEqual([]);
    });
  });
});
