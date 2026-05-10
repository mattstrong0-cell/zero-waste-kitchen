/**
 * Full pipeline runner — chains scraper → analyzer → matcher sequentially.
 * Each step runs in its own process. If a step fails, the error is logged
 * and the next step is skipped (downstream steps need the previous output).
 *
 * Run: node run-pipeline.js
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync, readFileSync } from 'fs';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

const STEPS = [
  { name: 'Scraper',  script: join(__dirname, 'scraper', 'index.js'),   outputDir: 'data/scraped',   filePrefix: null },
  { name: 'Analyzer', script: join(__dirname, 'analyzer', 'analyze.js'), outputDir: 'data/analysis',  filePrefix: 'analysis_' },
  { name: 'Matcher',  script: join(__dirname, 'matcher', 'match.js'),    outputDir: 'data/matched',   filePrefix: 'matched_' },
];

function runStep(scriptPath) {
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

function countLatestOutput(step) {
  const dir = join(__dirname, step.outputDir);
  if (!existsSync(dir)) return null;

  if (!step.filePrefix) {
    // Scraper: count total items across all platform files written today
    const today = new Date().toISOString().split('T')[0];
    const files = readdirSync(dir).filter(f => f.endsWith(`_${today}.json`));
    let total = 0;
    for (const f of files) {
      try {
        const data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        if (Array.isArray(data)) total += data.length;
      } catch { /* skip */ }
    }
    return total;
  }

  // Analyzer / Matcher: read the latest timestamped file
  const files = readdirSync(dir)
    .filter(f => f.startsWith(step.filePrefix) && f.endsWith('.json'))
    .sort()
    .reverse();
  if (files.length === 0) return null;

  try {
    const data = JSON.parse(readFileSync(join(dir, files[0]), 'utf8'));
    if (step.filePrefix === 'analysis_') {
      const formats = data.patterns?.viralFormats?.length ?? 0;
      const themes  = data.patterns?.engagementThemes?.length ?? 0;
      return `${formats} formats, ${themes} themes`;
    }
    if (step.filePrefix === 'matched_') {
      return `${data.topOverall?.length ?? 0} combos ranked`;
    }
  } catch { /* skip */ }
  return null;
}

(async () => {
  const divider = '─'.repeat(52);
  console.log('\nZero Waste Kitchen — Full Pipeline');
  console.log(`${divider}\n`);

  const results = [];
  let abort = false;

  for (const step of STEPS) {
    if (abort) {
      results.push({ name: step.name, status: 'skipped' });
      console.log(`  ⊘  ${step.name}: skipped (previous step failed)\n`);
      continue;
    }

    console.log(`${divider}`);
    console.log(`  ${step.name}`);
    console.log(divider);

    try {
      await runStep(step.script);
      const summary = countLatestOutput(step);
      results.push({ name: step.name, status: 'ok', summary });
    } catch (err) {
      console.error(`  Pipeline error for ${step.name}: ${err.message}`);
      results.push({ name: step.name, status: 'failed', error: err.message });
      abort = true;
    }
  }

  console.log(`\n${divider}`);
  console.log('  Summary');
  console.log(divider);
  for (const { name, status, summary, error } of results) {
    const icon = status === 'ok' ? '✓' : status === 'skipped' ? '⊘' : '✗';
    const detail = summary ? `  (${summary})` : error ? `  — ${error}` : '';
    console.log(`  ${icon}  ${name}: ${status}${detail}`);
  }
  console.log(divider + '\n');

  const failed = results.filter(r => r.status === 'failed');
  if (failed.length > 0) process.exit(1);
})();
