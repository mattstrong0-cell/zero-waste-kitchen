/**
 * Pipeline runner — executes all 3 scrapers sequentially.
 * Each scraper runs in its own process so failures are isolated.
 *
 * Run: node scraper/index.js
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SCRAPERS = [
  { name: 'TikTok',     script: join(__dirname, 'tiktok.js') },
  { name: 'Pinterest',  script: join(__dirname, 'pinterest.js') },
  { name: 'Instagram',  script: join(__dirname, 'instagram.js') },
];

function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

(async () => {
  console.log('Zero Waste Kitchen — Content Scraper Pipeline');
  console.log(`Running ${SCRAPERS.length} platform scrapers\n`);

  const results = [];

  for (const { name, script } of SCRAPERS) {
    const divider = '─'.repeat(50);
    console.log(`\n${divider}`);
    console.log(`  ${name}`);
    console.log(divider);

    try {
      await runScript(script);
      results.push({ name, status: 'ok' });
    } catch (err) {
      console.error(`  Pipeline error for ${name}: ${err.message}`);
      results.push({ name, status: 'failed', error: err.message });
    }
  }

  const divider = '─'.repeat(50);
  console.log(`\n${divider}`);
  console.log('  Summary');
  console.log(divider);
  for (const { name, status } of results) {
    const icon = status === 'ok' ? '✓' : '✗';
    console.log(`  ${icon} ${name}: ${status}`);
  }
  console.log(divider + '\n');

  const failed = results.filter(r => r.status === 'failed');
  if (failed.length === SCRAPERS.length) process.exit(1);
})();
