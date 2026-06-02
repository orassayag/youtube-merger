/**
 * YouTube Takeout Migration Script
 * Migrates subscriptions, playlists, and liked videos from a Google Takeout export
 * to another YouTube account using the YouTube Data API v3.
 *
 * SETUP:
 * 1. Go to https://console.cloud.google.com/
 * 2. Create a new project (or use existing)
 * 3. Enable "YouTube Data API v3"
 * 4. Create OAuth 2.0 credentials (Desktop App type)
 * 5. Download the credentials JSON
 * 6. Run: npm install googleapis csv-parse
 * 7. Run: npx ts-node youtube-migrate.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { parse } from 'csv-parse/sync';
import { google, youtube_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

// ─── CONFIG ────────────────────────────────────────────────────────────────────

const CONFIG = {
  // Path to your OAuth2 credentials JSON downloaded from Google Cloud Console
  credentialsPath: './credentials.json',

  // Token will be saved here after first auth so you don't re-authenticate every time
  tokenPath: './token.json',

  // Root folder of your Google Takeout YouTube export
  // Should contain: subscriptions/subscriptions.csv, playlists/, history/, etc.
  takeoutPath: './Takeout/YouTube and YouTube Music',

  // What to migrate - set to false to skip
  migrate: {
    subscriptions: true,
    playlists: true,
    likedVideos: true,
  },

  // Delay between API calls in ms to avoid hitting rate limits (quota)
  rateLimitDelay: 500,
};

// ─── TYPES ─────────────────────────────────────────────────────────────────────

interface Subscription {
  channelId: string;
  channelTitle: string;
  channelUrl: string;
}

// ─── AUTH ──────────────────────────────────────────────────────────────────────

async function authenticate(): Promise<OAuth2Client> {
  const credentials = JSON.parse(fs.readFileSync(CONFIG.credentialsPath, 'utf-8'));
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // Use saved token if available
  if (fs.existsSync(CONFIG.tokenPath)) {
    const token = JSON.parse(fs.readFileSync(CONFIG.tokenPath, 'utf-8'));
    oAuth2Client.setCredentials(token);
    console.log('✅ Authenticated using saved token.');
    return oAuth2Client;
  }

  // Otherwise prompt for new auth
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.force-ssl',
    ],
  });

  console.log('\n🔐 Authorize this app by visiting:\n');
  console.log(authUrl);
  console.log();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise<string>((resolve) =>
    rl.question('Enter the authorization code from that page: ', (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(CONFIG.tokenPath, JSON.stringify(tokens));
  console.log('✅ Token saved to', CONFIG.tokenPath);

  return oAuth2Client;
}

// ─── HELPERS ───────────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, label: string, retries = 3): Promise<T | null> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 409) {
        // Already exists - not an error
        return null;
      }
      if (status === 403) {
        console.warn(`⚠️  Quota exceeded on "${label}". Waiting 60s...`);
        await delay(60000);
      } else {
        console.warn(`⚠️  Error on "${label}" (attempt ${i + 1}): ${err.message}`);
        await delay(2000);
      }
    }
  }
  console.error(`❌ Failed after ${retries} attempts: ${label}`);
  return null;
}

// ─── SUBSCRIPTIONS ─────────────────────────────────────────────────────────────

function parseSubscriptions(): Subscription[] {
  const csvPath = path.join(CONFIG.takeoutPath, 'subscriptions', 'subscriptions.csv');
  if (!fs.existsSync(csvPath)) {
    console.warn('⚠️  subscriptions.csv not found at:', csvPath);
    return [];
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(content, { columns: true, skip_empty_lines: true });

  return records.map((r: any) => ({
    channelId: r['Channel Id'] || r['channel_id'] || r['channelId'],
    channelTitle: r['Channel Title'] || r['channel_title'] || r['channelTitle'],
    channelUrl: r['Channel Url'] || r['channel_url'] || r['channelUrl'],
  }));
}

async function migrateSubscriptions(youtube: youtube_v3.Youtube, subscriptions: Subscription[]) {
  console.log(`\n📋 Migrating ${subscriptions.length} subscriptions...`);
  let success = 0,
    skipped = 0,
    failed = 0;

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

    if (result === null) {
      // withRetry returns null for 409 (already subscribed) or fatal failure
      console.log('already subscribed');
      skipped++;
    } else {
      console.log('✅');
      success++;
    }

    await delay(CONFIG.rateLimitDelay);
  }

  console.log(`\n  Subscriptions: ${success} added, ${skipped} skipped, ${failed} failed`);
}

// ─── PLAYLISTS ─────────────────────────────────────────────────────────────────

function parsePlaylists(): Map<string, string[]> {
  // Returns Map<playlistName, videoId[]>
  const playlistsDir = path.join(CONFIG.takeoutPath, 'playlists');
  const result = new Map<string, string[]>();

  if (!fs.existsSync(playlistsDir)) {
    console.warn('⚠️  playlists/ folder not found at:', playlistsDir);
    return result;
  }

  const files = fs.readdirSync(playlistsDir).filter((f) => f.endsWith('.csv'));

  for (const file of files) {
    // Skip liked videos and watch later (handled separately)
    if (file.toLowerCase().includes('liked') || file.toLowerCase().includes('watch-later'))
      continue;

    const playlistName = path.basename(file, '.csv');
    const content = fs.readFileSync(path.join(playlistsDir, file), 'utf-8');

    try {
      const records = parse(content, { columns: true, skip_empty_lines: true, from_line: 4 });
      const videoIds = records
        .map((r: any) => r['Video Id'] || r['video_id'] || r['videoId'])
        .filter(Boolean);
      result.set(playlistName, videoIds);
    } catch {
      console.warn(`  ⚠️  Could not parse ${file}`);
    }
  }

  return result;
}

async function migratePlaylist(youtube: youtube_v3.Youtube, name: string, videoIds: string[]) {
  console.log(`\n  📁 Creating playlist "${name}" (${videoIds.length} videos)...`);

  // Create the playlist
  const playlist = await withRetry(
    () =>
      youtube.playlists.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: { title: name, description: `Imported from YouTube Takeout` },
          status: { privacyStatus: 'private' },
        },
      }),
    `create playlist ${name}`
  );

  if (!playlist?.data?.id) {
    console.error(`  ❌ Could not create playlist "${name}"`);
    return;
  }

  const playlistId = playlist.data.id;
  let added = 0;

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

    if (res) added++;
    await delay(CONFIG.rateLimitDelay);
  }

  console.log(`  ✅ "${name}": ${added}/${videoIds.length} videos added`);
}

async function migratePlaylists(youtube: youtube_v3.Youtube) {
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

// ─── LIKED VIDEOS ──────────────────────────────────────────────────────────────

function parseLikedVideos(): string[] {
  const playlistsDir = path.join(CONFIG.takeoutPath, 'playlists');
  const likedFile = fs.readdirSync(playlistsDir).find((f) => f.toLowerCase().includes('liked'));

  if (!likedFile) {
    console.warn('⚠️  Liked videos CSV not found');
    return [];
  }

  const content = fs.readFileSync(path.join(playlistsDir, likedFile), 'utf-8');
  try {
    const records = parse(content, { columns: true, skip_empty_lines: true, from_line: 4 });
    return records.map((r: any) => r['Video Id'] || r['video_id'] || r['videoId']).filter(Boolean);
  } catch {
    return [];
  }
}

async function migrateLikedVideos(youtube: youtube_v3.Youtube) {
  const videoIds = parseLikedVideos();
  if (videoIds.length === 0) {
    console.log('\n⏭️  No liked videos to migrate.');
    return;
  }

  console.log(`\n📋 Liking ${videoIds.length} videos...`);
  let success = 0;

  for (const videoId of videoIds) {
    const res = await withRetry(
      () => youtube.videos.rate({ id: videoId, rating: 'like' }),
      `like video ${videoId}`
    );
    if (res !== undefined) success++;
    await delay(CONFIG.rateLimitDelay);
  }

  console.log(`  ✅ ${success}/${videoIds.length} videos liked`);
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 YouTube Takeout Migration\n');

  if (!fs.existsSync(CONFIG.credentialsPath)) {
    console.error(
      `❌ credentials.json not found at "${CONFIG.credentialsPath}".\n` +
        `   Please download it from Google Cloud Console > APIs & Services > Credentials.\n` +
        `   Make sure it's an OAuth 2.0 Desktop App credential.`
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

main().catch(console.error);
