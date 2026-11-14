#!/usr/bin/env node
/**
 * Runs the QualityLab JMeter plan with one profile against one target, then builds the HTML
 * dashboard, writes a Markdown summary of the measured metrics, and opens the dashboard in Chrome.
 *
 *   node scripts/run.js --profile baseline --target local
 *   node scripts/run.js --profile baseline --target deployed
 *   node scripts/run.js --profile load --target deployed --approved     (needs your approval first)
 *
 * Options:
 *   --profile smoke|baseline|load|stress|spike|endurance   (default smoke)
 *   --target  local|deployed                               (default local)
 *   --approved          allow the load profile against the deployed site (still capped at 5 users)
 *   --allow-high-load   lift every safety limit for the deployed site (do not use without a plan)
 *   --no-bookings       leave out the booking create/cancel journey
 *   --users N           override the profile's number of users
 *   --duration S        override the profile's duration in seconds
 *
 * Settings come from environment variables or the git-ignored .env file:
 *   TEST_USERNAME, TEST_PASSWORD   the seeded customer (required)
 *   JMETER_HOME                    default C:\dev\tools\apache-jmeter-5.6.3
 *   JAVA_HOME                      optional; otherwise "java" on the PATH
 *   OPEN_REPORT                    always (default), on-failure, never
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn, exec } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { summarize } = require('./summarize');

const ROOT = path.resolve(__dirname, '..');
if (fs.existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));

const PROFILES = ['smoke', 'baseline', 'load', 'stress', 'spike', 'endurance'];
const HEAVY = ['stress', 'spike', 'endurance'];

function parseArgs(argv) {
  const options = { profile: 'smoke', target: 'local', approved: false, allowHighLoad: false, bookings: true, overrides: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--profile') options.profile = argv[++i];
    else if (arg === '--target') options.target = argv[++i];
    else if (arg === '--approved') options.approved = true;
    else if (arg === '--allow-high-load') options.allowHighLoad = true;
    else if (arg === '--no-bookings') options.bookings = false;
    else if (arg === '--users') options.overrides.users = argv[++i];
    else if (arg === '--duration') options.overrides.duration = argv[++i];
    else throw new Error(`Unknown option "${arg}". See the comment at the top of scripts/run.js.`);
  }
  if (!PROFILES.includes(options.profile)) throw new Error(`--profile must be one of: ${PROFILES.join(', ')}.`);
  if (!['local', 'deployed'].includes(options.target)) throw new Error('--target must be local or deployed.');
  return options;
}

function readProperties(file) {
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/);
    if (match && !line.trim().startsWith('#')) values[match[1]] = match[2];
  }
  return values;
}

/** The same rules as the plan's setUp safety check, applied before JMeter even starts. */
function safetyCheck(options, settings) {
  if (options.target !== 'deployed' || options.allowHighLoad) return;
  const users = Number(settings.users || 1) + Number(settings.spikeUsers || 0);
  const limit = Number(settings.deployedMaxUsers || 5);
  if (HEAVY.includes(options.profile)) {
    throw new Error(`The ${options.profile} profile is not allowed against the deployed site. Use --target local.`);
  }
  if (!['smoke', 'baseline'].includes(options.profile) && !options.approved) {
    throw new Error(`The ${options.profile} profile against the deployed site needs approval: add --approved once it has been agreed.`);
  }
  if (users > limit) throw new Error(`${users} users is above the limit of ${limit} for the deployed site.`);
}

function javaCommand() {
  if (process.env.JAVA_HOME) {
    const candidate = path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
    if (fs.existsSync(candidate)) return candidate;
  }
  const temurin = 'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.13.9-hotspot\\bin\\java.exe';
  if (process.platform === 'win32' && fs.existsSync(temurin)) return temurin;
  return 'java';
}

function stamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function openInChrome(file) {
  const url = pathToFileURL(file).href;
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const chrome = process.env.CHROME_PATH || roots.map((r) => path.join(r, 'Google', 'Chrome', 'Application', 'chrome.exe')).find((f) => fs.existsSync(f));
  if (process.platform === 'win32') {
    if (chrome) spawn(chrome, [url], { detached: true, stdio: 'ignore' }).unref();
    else exec(`start "" "${file}"`);
  } else if (process.platform === 'darwin') {
    spawn('open', ['-a', chrome || 'Google Chrome', file], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn(chrome || 'google-chrome', [url], { detached: true, stdio: 'ignore' }).on('error', () => exec(`xdg-open "${file}"`)).unref();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  for (const name of ['TEST_USERNAME', 'TEST_PASSWORD']) {
    if (!process.env[name]) throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
  }

  const targetFile = path.join(ROOT, 'targets', `${options.target}.properties`);
  const profileFile = path.join(ROOT, 'profiles', `${options.profile}.properties`);
  const settings = { ...readProperties(targetFile), ...readProperties(profileFile), ...options.overrides };
  safetyCheck(options, settings);

  const jmeterHome = process.env.JMETER_HOME || 'C:\\dev\\tools\\apache-jmeter-5.6.3';
  const jar = path.join(jmeterHome, 'bin', 'ApacheJMeter.jar');
  if (!fs.existsSync(jar)) throw new Error(`JMeter not found at ${jmeterHome}. Set JMETER_HOME (see README).`);

  const startedAt = new Date();
  const runDir = path.join(ROOT, 'results', `${stamp(startedAt)}_${options.profile}_${options.target}`);
  fs.mkdirSync(runDir, { recursive: true });

  const args = [
    '-Xms512m', '-Xmx1g',
    '-jar', jar,
    '-n',
    '-t', path.join(ROOT, 'plans', 'qualitylab-api.jmx'),
    '-q', targetFile,
    '-q', profileFile,
    `-JdataDir=${path.join(ROOT, 'data')}`,
    `-Japproved=${options.approved}`,
    `-JallowHighLoad=${options.allowHighLoad}`,
    `-Jbookings=${options.bookings}`,
    ...Object.entries(options.overrides).map(([key, value]) => `-J${key}=${value}`),
    // Leave the setUp safety sample out of the dashboard; its labels start with "_".
    '-Jjmeter.reportgenerator.sample_filter=[A-Za-z].*',
    '-l', path.join(runDir, 'results.jtl'),
    '-j', path.join(runDir, 'jmeter.log'),
    '-e', '-o', path.join(runDir, 'dashboard'),
  ];

  const baseUrl = `${settings.protocol}://${settings.host}${['80', '443'].includes(settings.port) ? '' : `:${settings.port}`}${settings.basePath}`;
  console.log(`JMeter ${options.profile} against ${options.target} (${baseUrl}), ${settings.users} users${settings.spikeUsers ? ` + ${settings.spikeUsers} spike users` : ''}, ${settings.duration} s`);
  console.log(`Results: ${path.relative(process.cwd(), runDir)}\n`);

  // Credentials go to JMeter as environment variables only; the plan's setUp reads them.
  const code = await new Promise((resolve) => {
    const child = spawn(javaCommand(), args, { cwd: ROOT, stdio: 'inherit', env: process.env });
    child.on('exit', resolve);
    child.on('error', (error) => {
      console.error(error.message);
      resolve(1);
    });
  });

  const log = fs.existsSync(path.join(runDir, 'jmeter.log')) ? fs.readFileSync(path.join(runDir, 'jmeter.log'), 'utf8') : '';
  const safety = log.match(/SAFETY CHECK: (.*)/);
  const autoStop = log.match(/AUTO-STOP: limit reached \((.*?)\)/);
  const info = {
    profile: options.profile,
    target: options.target,
    baseUrl,
    users: Number(settings.users),
    spikeUsers: Number(settings.spikeUsers || 0),
    durationSeconds: Number(settings.duration),
    bookings: options.bookings,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    autoStopped: autoStop ? autoStop[1] : null,
    jmeterExitCode: code,
  };
  fs.writeFileSync(path.join(runDir, 'run-info.json'), `${JSON.stringify(info, null, 2)}\n`);

  if (safety) throw new Error(`Refused by the plan's safety check: ${safety[1]}`);
  if (!fs.existsSync(path.join(runDir, 'dashboard', 'statistics.json'))) {
    throw new Error(`JMeter did not produce a dashboard (exit code ${code}). See ${path.join(runDir, 'jmeter.log')}.`);
  }

  console.log(`\n${summarize(runDir)}`);
  const dashboard = path.join(runDir, 'dashboard', 'index.html');
  console.log(`Dashboard: ${path.relative(process.cwd(), dashboard)}`);
  fs.writeFileSync(path.join(ROOT, 'results', 'latest.txt'), `${path.relative(ROOT, runDir)}\n`);

  const stats = JSON.parse(fs.readFileSync(path.join(runDir, 'dashboard', 'statistics.json'), 'utf8'));
  const failed = (stats.Total?.errorPct ?? 0) > 0;
  const mode = (process.env.OPEN_REPORT || 'always').toLowerCase();
  if (!process.env.CI && mode !== 'never' && mode !== 'false' && (mode !== 'on-failure' || failed)) openInChrome(dashboard);
  process.exitCode = code === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
