import type { youtube_v3 } from 'googleapis';
import { CONFIG } from '../index.js';
import { delay, withRetry } from '../api/index.js';
import { parsePlaylists } from '../parsers/index.js';

async function migratePlaylist(
  youtube: youtube_v3.Youtube,
  name: string,
  videoIds: string[]
): Promise<void> {
  console.log(
    `\n  📁 Creating playlist "${name}" (${videoIds.length} videos)...`
  );

  const createResult = await withRetry(
    () =>
      youtube.playlists.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: name,
            description: 'Imported from YouTube Takeout',
          },
          status: { privacyStatus: 'private' },
        },
      }),
    `create playlist ${name}`
  );

  if (createResult.status !== 'success' || !createResult.data.data?.id) {
    console.error(`  ❌ Could not create playlist "${name}"`);
    return;
  }

  const playlistId = createResult.data.data.id;
  let added = 0;
  let skipped = 0;
  let failed = 0;

  for (const videoId of videoIds) {
    const res = await withRetry(
      () =>
        youtube.playlistItems.insert({
          part: ['snippet'],
          requestBody: {
            snippet: {
              playlistId,
              resourceId: { kind: 'youtube#video', videoId },
            },
          },
        }),
      `add video ${videoId}`
    );

    if (res.status === 'success') added++;
    else if (res.status === 'duplicate') skipped++;
    else failed++;

    await delay(CONFIG.rateLimitDelay);
  }

  console.log(
    `  ✅ "${name}": ${added}/${videoIds.length} videos added` +
      (skipped || failed ? ` (${skipped} dup, ${failed} failed)` : '')
  );
}

export async function migratePlaylists(
  youtube: youtube_v3.Youtube
): Promise<void> {
  const playlists = parsePlaylists();
  if (playlists.size === 0) {
    console.log('\n⏭️  No playlists to migrate.');
    return;
  }

  console.log(`\n📋 Migrating ${playlists.size} playlists...`);
  for (const [name, videoIds] of playlists) {
    await migratePlaylist(youtube, name, videoIds);
  }
}
