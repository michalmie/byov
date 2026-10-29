#!/usr/bin/env node
// Factory snapshots this adapter independently of the application task commit.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function readRequest(file) {
  const r = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dir = fs.realpathSync(path.dirname(file));
  if (r.version !== 1 || !/^[0-9a-f-]{36}$/.test(r.id) || path.basename(dir) !== r.id
    || r.directory !== dir || r.checkout !== path.join(dir, 'checkout')
    || r.allowEmail !== undefined && typeof r.allowEmail !== 'boolean'
    || !Number.isInteger(r.ports?.web) || r.ports.web < 1024 || r.ports.web > 65535) throw new Error('Invalid preview request.');
  const origin = new URL(r.origin);
  if (origin.protocol !== 'http:' || origin.username || origin.password || origin.origin !== r.origin
    || Number(origin.port) !== r.ports.web || net.isIP(origin.hostname) !== 4) throw new Error('Invalid isolated preview origin.');
  const checkout = fs.realpathSync(r.checkout);
  if (checkout !== r.checkout || fs.realpathSync(r.source) === checkout) throw new Error('Preview checkout must be isolated.');
  for (const name of ['data', 'home', 'secrets.json', 'resources.json']) {
    const target = path.join(dir, name);
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('Preview resource is a symlink.');
  }
  return r;
}
function write(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}
/** Install Factory's copied mail account into the preview checkout when the
 * operator enabled email sending, so the app sends through the same saved
 * account as the normal environment. Without the opt-in any account file is
 * removed instead; the app then falls back to its console mail logging. */
export function installPreviewMail(r) {
  const target = path.join(r.checkout, 'data', 'mail.json');
  if (r.allowEmail !== true) {
    fs.rmSync(target, { force: true });
    return null;
  }
  for (const entry of [path.dirname(target), target]) {
    let entryStat = null;
    try { entryStat = fs.lstatSync(entry); } catch { /* absent entries are created below */ }
    if (entryStat?.isSymbolicLink()) throw new Error('The preview mail target must not be a symlink.');
  }
  let raw;
  try {
    raw = fs.readFileSync(path.join(r.directory, 'email-account.json'), 'utf8');
  } catch {
    throw new Error('Email sending is enabled but the preview mail account is missing.');
  }
  let account;
  try {
    account = JSON.parse(raw);
  } catch {
    throw new Error('The preview mail account is invalid. Save it again in Settings → Email.');
  }
  if (!account || typeof account !== 'object' || Array.isArray(account)
    || typeof account.host !== 'string' || !account.host.trim()
    || typeof account.port !== 'number' || !Number.isInteger(account.port) || account.port < 1 || account.port > 65535
    || !['auto', 'ssl', 'starttls'].includes(account.security)
    || typeof account.user !== 'string' || typeof account.pass !== 'string' || typeof account.from !== 'string') {
    throw new Error('The preview mail account is invalid. Save it again in Settings → Email.');
  }
  const stored = { host: account.host.trim(), port: account.port, security: account.security, user: account.user.trim(), pass: account.pass, from: account.from.trim() };
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, `${JSON.stringify(stored)}\n`, { mode: 0o600 });
  if (stored.pass) {
    const redactionFile = path.join(r.directory, 'redaction.json');
    let redacted = [];
    try {
      const existing = JSON.parse(fs.readFileSync(redactionFile, 'utf8'));
      if (Array.isArray(existing)) redacted = existing.filter(entry => typeof entry === 'string');
    } catch { /* no redaction file yet */ }
    if (!redacted.includes(stored.pass)) redacted.push(stored.pass);
    write(redactionFile, redacted);
  }
  return target;
}
export function previewEnvironment(r, secrets) {
  // No source dotenv, marketplace credentials, SMTP or payment keys are copied
  // into the environment. Mail arrives only as a validated file install with
  // the explicit per-preview email opt-in (see installPreviewMail).
  return { PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin', HOME: path.join(r.directory, 'home'),
    LANG: 'C.UTF-8', CI: '1', NODE_ENV: 'production', NODE_OPTIONS: '--max-old-space-size=2048',
    NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SITE_URL: r.origin, PORT: String(r.ports.web),
    DROPNINJA_DATA_DIR: path.join(r.directory, 'data/dropninja'),
    LEAD_STORAGE_DIR: path.join(r.directory, 'data/leads'), ORDER_STORE_PATH: path.join(r.directory, 'data/orders.json'),
    DATABASE_PROFILE: 'sqlite', DATABASE_URL: `file:${path.join(r.directory, 'data/preview.sqlite')}`,
    STRIPE_ENVIRONMENT: 'test', NEXT_PUBLIC_GA_MEASUREMENT_ID: '',
    COOKIE_SECRET: secrets.cookieSecret, DOWNLOAD_TOKEN_SECRET: secrets.downloadSecret,
    ADMIN_PASSWORD: secrets.adminPassword };
}
function run(command, args, r, env, timeout) {
  execFileSync(command, args, { cwd: r.checkout, env, stdio: 'inherit', timeout });
}
function assertOwned(r, resources) {
  if (resources?.id !== r.id || resources.checkout !== r.checkout || resources.data !== path.join(r.directory, 'data')) {
    throw new Error('Preview resource ownership changed. No resources were removed.');
  }
}
export async function main(step, file) {
  if (!['prepare', 'build', 'start', 'discard'].includes(step)) throw new Error('Unknown preview adapter step.');
  const r = readRequest(file);
  const resourceFile = path.join(r.directory, 'resources.json');
  if (step === 'prepare') {
    if (fs.existsSync(resourceFile)) throw new Error('Preview already prepared; discard it before rebuilding.');
    write(resourceFile, { id: r.id, checkout: r.checkout, data: path.join(r.directory, 'data') });
    fs.mkdirSync(path.join(r.directory, 'home'), { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(r.directory, 'data'), { recursive: true, mode: 0o700 });
    const secrets = { cookieSecret: randomBytes(32).toString('hex'), downloadSecret: randomBytes(32).toString('hex'),
      adminPassword: randomBytes(18).toString('base64url') };
    write(path.join(r.directory, 'secrets.json'), secrets);
    installPreviewMail(r);
    // Next loads .env.production as well as .env.local. Remove any committed
    // dotenv from this disposable checkout before generating preview variables.
    for (const name of fs.readdirSync(r.checkout).filter(n => n === '.env' || n.startsWith('.env.'))) {
      if (name === '.env.example') continue;
      const target = path.join(r.checkout, name);
      if (!fs.lstatSync(target).isFile()) throw new Error('Unexpected preview dotenv file.');
      fs.rmSync(target);
    }
    const env = previewEnvironment(r, secrets);
    const appVars = Object.entries(env).filter(([key]) => !['PATH', 'HOME', 'LANG', 'CI', 'NODE_ENV', 'NODE_OPTIONS'].includes(key));
    fs.writeFileSync(path.join(r.checkout, '.env.local'), appVars.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('\n') + '\n', { mode: 0o600 });
    const pkg = JSON.parse(fs.readFileSync(path.join(r.checkout, 'package.json'), 'utf8'));
    if (!pkg.dependencies?.next || !fs.existsSync(path.join(r.checkout, 'package-lock.json'))) throw new Error('A standalone Next.js app and committed npm lockfile are required.');
    run('npm', ['ci', '--include=dev', '--ignore-scripts', '--no-audit', '--no-fund'], r, env, 600_000);
    console.log(r.allowEmail === true
      ? 'Preview dependencies, disposable local data and the saved mail account prepared.'
      : 'Preview dependencies and disposable local data prepared. External service credentials are absent.');
    return;
  }
  assertOwned(r, JSON.parse(fs.readFileSync(resourceFile, 'utf8')));
  if (step === 'discard') {
    fs.rmSync(path.join(r.directory, 'data'), { force: true, recursive: true });
    fs.rmSync(path.join(r.directory, 'secrets.json'), { force: true });
    fs.rmSync(resourceFile);
    console.log('Owned preview data discarded.'); return;
  }
  const env = previewEnvironment(r, JSON.parse(fs.readFileSync(path.join(r.directory, 'secrets.json'), 'utf8')));
  const next = path.join(r.checkout, 'node_modules/next/dist/bin/next');
  if (step === 'build') {
    run(process.execPath, [next, 'build'], r, env, 900_000);
    return;
  }
  // Fail on a collision; never find or signal the normal application's PID.
  const probe = net.createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(r.ports.web, '0.0.0.0', resolve); });
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, [next, 'start', '--hostname', '0.0.0.0', '--port', String(r.ports.web)], { cwd: r.checkout, env, stdio: 'inherit' });
  const stop = () => child.kill('SIGTERM');
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  child.once('error', () => { console.error('Could not start the preview app.'); process.exitCode = 1; });
  child.once('exit', code => { process.exitCode = code ?? 1; });
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(...process.argv.slice(2)).catch(error => { console.error(`Preview adapter failed: ${error.message}`); process.exitCode = 1; });
}
