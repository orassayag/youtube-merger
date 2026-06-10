/**
 * YouTube Takeout migration: subscriptions, playlists, liked videos → target account (YouTube Data API v3).
 *
 * Setup: Google Cloud project → enable YouTube Data API v3 → OAuth 2.0 Desktop client → download JSON as credentials.json.
 */
import * as fs from 'node:fs';
import { google } from 'googleapis';
import { CONFIG } from './index.js';
import { authenticate } from './auth/index.js';
import { parseSubscriptions } from './parsers/index.js';
import {
  migrateSubscriptions,
  migratePlaylists,
  migrateLikedVideos,
} from './migrate/index.js';

async function main(): Promise<void> {
  console.log('🚀 YouTube Takeout Migration\n');

  if (!fs.existsSync(CONFIG.credentialsPath)) {
    console.error(
      `❌ credentials.json not found at "${CONFIG.credentialsPath}".\n` +
        `   Download from Google Cloud Console → APIs & Services → Credentials (OAuth 2.0 Desktop App).`
    );
    process.exit(1);
  }

  const auth = await authenticate();
  const youtube = google.youtube({ version: 'v3', auth });

  if (CONFIG.migrate.subscriptions) {
    const subs = parseSubscriptions();
    await migrateSubscriptions(youtube, subs);
  }

  if (CONFIG.migrate.playlists) {
    await migratePlaylists(youtube);
  }

  if (CONFIG.migrate.likedVideos) {
    await migrateLikedVideos(youtube);
  }

  console.log('\n🎉 Migration complete!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
