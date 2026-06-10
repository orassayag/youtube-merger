import type { youtube_v3 } from 'googleapis';
import { CONFIG } from '../index.js';
import { delay, withRetry } from '../api/index.js';
import type { Subscription } from '../types/index.js';

export async function migrateSubscriptions(
  youtube: youtube_v3.Youtube,
  subscriptions: Subscription[]
): Promise<void> {
  console.log(`\n📋 Migrating ${subscriptions.length} subscriptions...`);
  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    process.stdout.write(`  → ${sub.channelTitle}... `);

    const result = await withRetry(
      () =>
        youtube.subscriptions.insert({
          part: ['snippet'],
          requestBody: {
            snippet: {
              resourceId: {
                kind: 'youtube#channel',
                channelId: sub.channelId,
              },
            },
          },
        }),
      `subscribe to ${sub.channelTitle}`
    );

    if (result.status === 'success') {
      console.log('✅');
      success++;
    } else if (result.status === 'duplicate') {
      console.log('already subscribed');
      skipped++;
    } else {
      console.log('❌');
      failed++;
    }

    await delay(CONFIG.rateLimitDelay);
  }

  console.log(
    `\n  Subscriptions: ${success} added, ${skipped} skipped, ${failed} failed`
  );
}
