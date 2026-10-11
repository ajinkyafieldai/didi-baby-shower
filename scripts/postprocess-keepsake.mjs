#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { keepsakeGames, recordingTimeline, renderGames, renderTimeline, keepsakeControls,
  controlsPolicy, printButton, printStyles } from '../frontend/keepsake-extras.js';

export async function postprocessKeepsake(html, { snapshot, records, video } = {}) {
  if (!/<\/main>/i.test(html) || !/<\/head>/i.test(html)) throw new Error('Input must be an exported keepsake HTML.');
  if (html.includes('id="keepsake-postprocessed"')) throw new Error('This keepsake has already been post-processed. Use the original export.');
  if (video && !records) throw new Error('--video requires --notes so the recording can be identified.');
  let games = snapshot ? renderGames(keepsakeGames(snapshot.games)) : '';
  const replaceGames = games && html.includes('<!-- keepsake-games:start -->');
  if (replaceGames) { html = html.replace(/<!-- keepsake-games:start -->[\s\S]*?<!-- keepsake-games:end -->/, games); games = ''; }
  const extras = games +
    (records ? renderTimeline(recordingTimeline(records), video) : '');
  if (!extras && !replaceGames) throw new Error('Provide a snapshot and/or recording notes.');
  const policy = await controlsPolicy();
  // Generated keepsakes use this exact restrictive policy. Refuse unknown policies rather than weaken them.
  const oldPolicy = "default-src 'none'; img-src data:; style-src 'unsafe-inline'";
  if (!html.includes(oldPolicy)) throw new Error('Unsupported keepsake security policy. Use an original HTML export.');
  if (!html.includes(policy)) html = html.replace(oldPolicy, `${oldPolicy}; ${policy}`);
  html = html.replace(/<\/head>/i, `<style>${printStyles}</style></head>`);
  const controls = html.includes(keepsakeControls) ? '' : `<script>${keepsakeControls}</script>`;
  const button = html.includes('data-keepsake-print') ? '' : printButton;
  return html.replace(/<\/main>/i, `<div id="keepsake-postprocessed">${button}${extras}</div>${controls}</main>`);
}

export async function run(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!['--input', '--output', '--snapshot', '--notes', '--video'].includes(key) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Usage: node scripts/postprocess-keepsake.mjs --input original.html --output enriched.html [--snapshot events.json] [--notes recording-notes.jsonl] [--video recording.mp4]');
    if (options[key]) throw new Error(`Duplicate option: ${key}`);
    options[key] = args[i + 1];
  }
  if (!options['--input'] || !options['--output']) throw new Error('--input and --output are required.');
  if (resolve(options['--input']) === resolve(options['--output'])) throw new Error('Output must differ from the original export.');
  const snapshot = options['--snapshot'] ? JSON.parse(await readFile(options['--snapshot'], 'utf8')) : undefined;
  if (snapshot && (!snapshot.games || !Array.isArray(snapshot.games.names) || !Array.isArray(snapshot.games.quiz))) throw new Error('Snapshot must contain games.names and games.quiz arrays from /api/events.');
  const records = options['--notes'] ? (await readFile(options['--notes'], 'utf8')).split(/\r?\n/).filter(line => line.trim()).map((line, i) => {
    try { return JSON.parse(line); } catch { throw new Error(`Invalid recording notes JSON on line ${i + 1}.`); }
  }) : undefined;
  const html = await postprocessKeepsake(await readFile(options['--input'], 'utf8'), { snapshot, records, video: options['--video'] });
  await writeFile(options['--output'], html, { flag: 'wx', mode: 0o600 });
  console.log(`Saved ${options['--output']}. Open it to view polls, recording bookmarks and Export PDF.`);
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  run(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
