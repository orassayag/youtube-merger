import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'csv-parse/sync';
import { CONFIG } from '../index.js';
import type { Subscription } from '../types/index.js';

function rowVideoId(r: Record<string, string>): string | undefined {
  return r['Video Id'] || r['video_id'] || r['videoId'];
}

function rowChannelId(r: Record<string, string>): string | undefined {
  return r['Channel Id'] || r['channel_id'] || r['channelId'];
}

export function parseSubscriptions(
  takeoutRoot: string = CONFIG.takeoutPath
): Subscription[] {
  const csvPath = path.join(takeoutRoot, 'subscriptions', 'subscriptions.csv');
  if (!fs.existsSync(csvPath)) {
    console.warn('⚠️  subscriptions.csv not found at:', csvPath);
    return [];
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
  }) as Record<string, string>[];

  return records.map((r) => ({
    channelId: rowChannelId(r) ?? '',
    channelTitle:
      r['Channel Title'] || r['channel_title'] || r['channelTitle'] || '',
    channelUrl: r['Channel Url'] || r['channel_url'] || r['channelUrl'] || '',
  }));
}

/** Map playlist display name → ordered video IDs (Takeout `playlists/*.csv`). */
export function parsePlaylists(
  takeoutRoot: string = CONFIG.takeoutPath
): Map<string, string[]> {
  const playlistsDir = path.join(takeoutRoot, 'playlists');
  const result = new Map<string, string[]>();

  if (!fs.existsSync(playlistsDir)) {
    console.warn('⚠️  playlists/ folder not found at:', playlistsDir);
    return result;
  }

  const files = fs.readdirSync(playlistsDir).filter((f) => f.endsWith('.csv'));

  for (const file of files) {
    const lower = file.toLowerCase();
    if (lower.includes('liked') || lower.includes('watch-later')) continue;

    const playlistName = path.basename(file, '.csv');
    const content = fs.readFileSync(path.join(playlistsDir, file), 'utf-8');

    try {
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        from_line: 4,
      }) as Record<string, string>[];
      const videoIds = records
        .map((r) => rowVideoId(r))
        .filter(Boolean) as string[];
      result.set(playlistName, videoIds);
    } catch {
      console.warn(`  ⚠️  Could not parse ${file}`);
    }
  }

  return result;
}

export function parseLikedVideos(
  takeoutRoot: string = CONFIG.takeoutPath
): string[] {
  const playlistsDir = path.join(takeoutRoot, 'playlists');
  if (!fs.existsSync(playlistsDir)) {
    console.warn('⚠️  playlists/ folder not found:', playlistsDir);
    return [];
  }

  const likedFile = fs
    .readdirSync(playlistsDir)
    .find((f) => f.toLowerCase().includes('liked'));

  if (!likedFile) {
    console.warn('⚠️  Liked videos CSV not found');
    return [];
  }

  const content = fs.readFileSync(path.join(playlistsDir, likedFile), 'utf-8');
  try {
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      from_line: 4,
    }) as Record<string, string>[];
    return records.map((r) => rowVideoId(r)).filter(Boolean) as string[];
  } catch {
    return [];
  }
}
