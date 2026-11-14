#!/usr/bin/env node
/**
 * Turns a JMeter HTML dashboard's statistics.json into a Markdown table of the measured results.
 *
 *   node scripts/summarize.js results/<run folder>
 *
 * Writes <run folder>/summary.md and prints it. All numbers are copied from JMeter's own
 * statistics; nothing is estimated.
 */
const fs = require('node:fs');
const path = require('node:path');

const ms = (value) => (value === undefined || value === null ? '-' : `${Math.round(value)}`);
const num = (value, digits = 2) => (value === undefined || value === null ? '-' : Number(value).toFixed(digits));

function summarize(runDir) {
  const stats = JSON.parse(fs.readFileSync(path.join(runDir, 'dashboard', 'statistics.json'), 'utf8'));
  const info = fs.existsSync(path.join(runDir, 'run-info.json')) ? JSON.parse(fs.readFileSync(path.join(runDir, 'run-info.json'), 'utf8')) : {};

  const rows = Object.values(stats).sort((a, b) => {
    if (a.transaction === 'Total') return 1;
    if (b.transaction === 'Total') return -1;
    const ja = a.transaction.startsWith('Journey') ? 0 : 1;
    const jb = b.transaction.startsWith('Journey') ? 0 : 1;
    return ja - jb || a.transaction.localeCompare(b.transaction);
  });

  const header =
    '| Request or journey | Samples | Errors % | Average ms | Median ms | 90th pct ms | 95th pct ms | 99th pct ms | Throughput /s |\n' +
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |';
  const body = rows
    .map((row) => {
      const name = row.transaction === 'Total' ? '**All requests (total)**' : row.transaction;
      return `| ${name} | ${row.sampleCount} | ${num(row.errorPct)} | ${ms(row.meanResTime)} | ${ms(row.medianResTime)} | ${ms(row.pct1ResTime)} | ${ms(row.pct2ResTime)} | ${ms(row.pct3ResTime)} | ${num(row.throughput, 3)} |`;
    })
    .join('\n');

  const total = stats.Total || {};
  const lines = [
    `# JMeter results: ${info.profile ?? 'run'} against ${info.target ?? 'target'}`,
    '',
    `- **Target:** ${info.baseUrl ?? '-'}`,
    `- **Profile:** ${info.profile ?? '-'} (${info.users ?? '-'} users${info.spikeUsers ? ` + ${info.spikeUsers} spike users` : ''}, ${info.durationSeconds ?? '-'} s planned)`,
    `- **Started / finished:** ${info.startedAt ?? '-'} / ${info.finishedAt ?? '-'}`,
    `- **Auto-stop:** ${info.autoStopped ?? 'not triggered'}`,
    `- **Total:** ${total.sampleCount ?? '-'} samples, ${num(total.errorPct)}% errors, ${num(total.throughput, 3)} requests per second`,
    '',
    'Journeys are Transaction Controllers: the time for all requests in the journey together, without think time.',
    'Percentiles are JMeter\'s 90th, 95th and 99th (aggregate_rpt_pct1..3).',
    '',
    header,
    body,
    '',
  ];
  const markdown = lines.join('\n');
  fs.writeFileSync(path.join(runDir, 'summary.md'), markdown);
  return markdown;
}

if (require.main === module) {
  const runDir = process.argv[2];
  if (!runDir) {
    console.error('Usage: node scripts/summarize.js results/<run folder>');
    process.exit(1);
  }
  console.log(summarize(path.resolve(runDir)));
}

module.exports = { summarize };
