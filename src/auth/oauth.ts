import * as fs from 'node:fs';
import * as readline from 'node:readline';
import { google } from 'googleapis';
import { CONFIG } from '../index.js';

export async function authenticate(): Promise<
  InstanceType<typeof google.auth.OAuth2>
> {
  const credentials = JSON.parse(
    fs.readFileSync(CONFIG.credentialsPath, 'utf-8')
  );
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  if (fs.existsSync(CONFIG.tokenPath)) {
    const token = JSON.parse(fs.readFileSync(CONFIG.tokenPath, 'utf-8'));
    oAuth2Client.setCredentials(token);
    console.log('✅ Authenticated using saved token.');
    return oAuth2Client;
  }

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

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
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
