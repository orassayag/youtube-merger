import type { youtube_v3 } from 'googleapis';
import { CONFIG } from '../index.js';
import { delay, withRetry } from '../api/index.js';
import { parseLikedVideos } from '../parsers/index.js';

export async function migrateLikedVideos(
  youtube: youtube_v3.Youtube
): Promise<void> {
  const videoIds = parseLikedVideos();
  if (videoIds.length === 0) {
    console.log('\n⏭️  No liked videos to migrate.');
    return;
  }

  console.log(`\n📋 Liking ${videoIds.length} videos...`);
  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const videoId of videoIds) {
    const res = await withRetry(
      () => youtube.videos.rate({ id: videoId, rating: 'like' }),
      `like video ${videoId}`
    );

    if (res.status === 'success') success++;
    else if (res.status === 'duplicate') skipped++;
    else failed++;

    await delay(CONFIG.rateLimitDelay);
  }

  console.log(
    `  ✅ ${success}/${videoIds.length} videos liked` +
      (skipped || failed ? ` (${skipped} skip, ${failed} failed)` : '')
  );
}
