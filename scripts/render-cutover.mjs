import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env');
const RENDER_API = 'https://api.render.com/v1';
const SERVICE_NAME = 'taro-api';
const RENDER_PORT = '10000';
const REGIONS = new Set(['oregon', 'ohio', 'virginia', 'frankfurt', 'singapore']);
const FAILED = new Set(['build_failed', 'update_failed', 'canceled', 'deactivated', 'pre_deploy_failed']);
const IN_PROGRESS = new Set(['created', 'queued', 'build_in_progress', 'update_in_progress', 'pre_deploy_in_progress']);
const LOCAL_ADDRESS = /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i;

export const SYNCED_NAMES = [
  'MONGODB_URI',
  'ENCRYPTION_KEY',
  'APP_URL',
  'WEB_ORIGINS',
  'EXTENSION_IDS',
  'SLACK_CLIENT_ID',
  'SLACK_CLIENT_SECRET',
  'SLACK_APP_TOKEN',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GITHUB_APP_ID',
  'GITHUB_APP_SLUG',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_APP_CLIENT_ID',
  'GITHUB_APP_CLIENT_SECRET',
  'LINEAR_CLIENT_ID',
  'LINEAR_CLIENT_SECRET',
  'JIRA_APP_INSTALL_URL',
  'INVITE_ADDRESS',
  'INBOUND_SECRET',
  'STT_WS_URL',
  'SHARED_GROQ_API_KEY',
  'SHARED_KEY_MEETINGS_PER_MONTH',
  'BOT_NAME',
  'BOT_IMAGE_URL',
  'MAX_ACTIVE_MEETINGS_PER_WORKSPACE',
  'TRUST_PROXY_HOPS',
];

export const BUILD_FILTER = {
  paths: ['packages/api/**', 'packages/shared/**', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'],
  ignoredPaths: [],
};

export function readEnvFile(file) {
  if (!existsSync(file)) throw new Error(`There is no .env file at ${file}.`);
  return parseEnv(readFileSync(file, 'utf8'));
}

export function missingSettings(fileEnv) {
  const missing = [];
  if (!fileEnv.RENDER_API_KEY) missing.push('RENDER_API_KEY');
  if (!fileEnv.MONGODB_URI) missing.push('MONGODB_URI');
  if (!fileEnv.ENCRYPTION_KEY) missing.push('ENCRYPTION_KEY');
  const slack = fileEnv.SLACK_CLIENT_ID && fileEnv.SLACK_CLIENT_SECRET;
  const google = fileEnv.GOOGLE_CLIENT_ID && fileEnv.GOOGLE_CLIENT_SECRET;
  if (!slack && !google) missing.push('SLACK_CLIENT_ID and SLACK_CLIENT_SECRET, or GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
  return missing;
}

export function serviceEnv(fileEnv, apiUrl) {
  const vars = { NODE_ENV: 'production', PORT: RENDER_PORT };
  const localOnly = [];
  for (const name of SYNCED_NAMES) {
    const value = fileEnv[name];
    if (!value) continue;
    if (LOCAL_ADDRESS.test(value)) {
      localOnly.push(name);
      continue;
    }
    vars[name] = value;
  }
  const fallbackAppUrl = fileEnv.NEXT_PUBLIC_APP_URL;
  if (!vars.APP_URL && fallbackAppUrl && !LOCAL_ADDRESS.test(fallbackAppUrl)) vars.APP_URL = fallbackAppUrl;
  if (apiUrl) vars.API_URL = apiUrl;
  const leftOut = Object.keys(fileEnv).filter((name) => !(name in vars) && !localOnly.includes(name));
  return { vars, localOnly, leftOut };
}

export function mergeEnv(existing, wanted) {
  const merged = { ...existing, ...wanted };
  const changed = Object.keys(wanted).filter((name) => existing[name] !== wanted[name]);
  return { merged, changed };
}

export function toEnvList(vars) {
  return Object.entries(vars).map(([key, value]) => ({ key, value }));
}

export function makeRedactor(fileEnv, keep = []) {
  const secrets = Object.entries(fileEnv)
    .filter(([name, value]) => !keep.includes(name) && typeof value === 'string' && value.length >= 8)
    .map(([, value]) => value)
    .sort((a, b) => b.length - a.length);
  return (text) => secrets.reduce((out, secret) => out.split(secret).join('[hidden]'), String(text));
}

export function repoUrl(remote) {
  const text = remote.trim();
  const scp = text.match(/^[^@/]+@([^:/]+):(.+?)(?:\.git)?\/?$/);
  if (scp) return `https://${scp[1]}/${scp[2]}`;
  const url = new URL(text);
  return `https://${url.hostname}${url.pathname.replace(/\/$/, '').replace(/\.git$/, '')}`;
}

export function deployPlan(changed, latest) {
  if (!latest) return 'deploy';
  if (changed) return IN_PROGRESS.has(latest.status) ? 'replace' : 'deploy';
  if (latest.status === 'live' || IN_PROGRESS.has(latest.status)) return 'wait';
  return 'deploy';
}

export function redirectUrls(apiUrl, vars) {
  const urls = [];
  if (vars.SLACK_CLIENT_ID) {
    urls.push(['Slack, Sign in with Slack', `${apiUrl}/api/auth/slack/callback`]);
    urls.push(['Slack, Add to Slack', `${apiUrl}/api/slack/callback`]);
  }
  if (vars.GOOGLE_CLIENT_ID) urls.push(['Google', `${apiUrl}/api/auth/google/callback`]);
  if (vars.GITHUB_APP_ID) urls.push(['GitHub App', `${apiUrl}/api/github/callback`]);
  if (vars.LINEAR_CLIENT_ID) urls.push(['Linear', `${apiUrl}/api/linear/callback`]);
  return urls;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function renderClient(apiKey, redact) {
  return async function call(method, route, body) {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(`${RENDER_API}${route}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      if (res.ok) return data;
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        await sleep(attempt * 5_000);
        continue;
      }
      const detail = data && typeof data.message === 'string' ? data.message : res.statusText;
      const where = route.split('?')[0];
      if (res.status === 401) throw new Error('Render did not accept RENDER_API_KEY. Make a new key in Render, Account Settings, API Keys, and put it in .env.');
      throw new Error(`Render answered ${res.status} to ${method} ${where}. ${redact(detail)}`);
    }
  };
}

async function listAll(call, route) {
  const items = [];
  let cursor = '';
  for (;;) {
    const join = route.includes('?') ? '&' : '?';
    const page = await call('GET', `${route}${join}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    const list = Array.isArray(page) ? page : [];
    items.push(...list);
    if (list.length < 100) return items;
    cursor = list[list.length - 1].cursor;
  }
}

async function pickOwner(call, wantedId) {
  const owners = (await listAll(call, '/owners')).map((item) => item.owner ?? item);
  if (wantedId) {
    const owner = owners.find((o) => o.id === wantedId);
    if (!owner) throw new Error('RENDER_OWNER_ID in .env is not a workspace this key can reach.');
    return owner;
  }
  if (owners.length === 1) return owners[0];
  if (owners.length === 0) throw new Error('This key reaches no Render workspace.');
  const choices = owners.map((o) => `  ${o.id}  ${o.name}`).join('\n');
  throw new Error(`This key reaches ${owners.length} Render workspaces. Add RENDER_OWNER_ID to .env with one of these IDs.\n${choices}`);
}

async function findService(call, ownerId) {
  const query = `/services?name=${SERVICE_NAME}&type=web_service&ownerId=${encodeURIComponent(ownerId)}&includePreviews=false`;
  const services = (await listAll(call, query)).map((item) => item.service ?? item).filter((s) => s.name === SERVICE_NAME);
  if (services.length > 1) throw new Error(`Render has ${services.length} services named ${SERVICE_NAME}. Delete the extra ones in the Render dashboard so only one API runs.`);
  return services[0] ?? null;
}

async function readServiceEnv(call, serviceId) {
  const items = await listAll(call, `/services/${serviceId}/env-vars`);
  return Object.fromEntries(items.map((item) => item.envVar ?? item).map((v) => [v.key, v.value]));
}

async function latestDeploy(call, serviceId) {
  const page = await call('GET', `/services/${serviceId}/deploys?limit=1`);
  const first = Array.isArray(page) ? page[0] : null;
  return first ? first.deploy ?? first : null;
}

async function startDeploy(call, serviceId, before) {
  const deploy = await call('POST', `/services/${serviceId}/deploys`, {});
  if (deploy && deploy.id) return deploy;
  for (let i = 0; i < 12; i++) {
    await sleep(5_000);
    const latest = await latestDeploy(call, serviceId);
    if (latest && latest.id !== before?.id) return latest;
  }
  throw new Error('Render took the deploy request but no new deploy showed up. Check the Events tab of taro-api in the Render dashboard.');
}

async function waitForDeploy(call, serviceId, deployId, say) {
  const deadline = Date.now() + 45 * 60_000;
  let last = '';
  while (Date.now() < deadline) {
    const deploy = await call('GET', `/services/${serviceId}/deploys/${deployId}`);
    const status = deploy?.status ?? 'unknown';
    if (status !== last) {
      say(`  Deploy ${status.replaceAll('_', ' ')}`);
      last = status;
    }
    if (status === 'live') return;
    if (FAILED.has(status)) throw new Error(`The deploy ended as ${status.replaceAll('_', ' ')}. Open taro-api in the Render dashboard and read its Logs. If they mention MongoDB, allow access from anywhere under Network Access in MongoDB Atlas and run this again.`);
    await sleep(10_000);
  }
  throw new Error('The deploy is still not live after 45 minutes. Check taro-api in the Render dashboard.');
}

async function waitForPath(url, minutes) {
  const deadline = Date.now() + minutes * 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (res.ok) return true;
    } catch {}
    await sleep(5_000);
  }
  return false;
}

function gitOrigin() {
  return execFileSync('git', ['-C', ROOT, 'remote', 'get-url', 'origin'], { encoding: 'utf8' });
}

async function main() {
  const fileEnv = readEnvFile(ENV_FILE);
  const redact = makeRedactor(fileEnv);
  const say = (text) => console.log(redact(text));

  say('Moving the Taro API to Render. No value from .env is ever printed.');
  const missing = missingSettings(fileEnv);
  if (missing.length) {
    say(`\n.env is missing ${missing.join(', ')}.`);
    if (missing.includes('RENDER_API_KEY')) {
      say('Make a key in Render, Account Settings, API Keys, then add a line RENDER_API_KEY=your-key to');
      say(`${ENV_FILE} in a text editor and run this again.`);
    }
    process.exitCode = 1;
    return;
  }

  const region = fileEnv.RENDER_REGION || 'oregon';
  if (!REGIONS.has(region)) throw new Error(`RENDER_REGION must be one of ${[...REGIONS].join(', ')}.`);
  const branch = fileEnv.RENDER_BRANCH || 'main';
  const call = renderClient(fileEnv.RENDER_API_KEY, redact);

  const owner = await pickOwner(call, fileEnv.RENDER_OWNER_ID);
  say(`Render workspace ${owner.name}`);

  let service = await findService(call, owner.id);
  if (service) {
    say(`Found ${SERVICE_NAME}, so this run updates it instead of making a second one.`);
  } else {
    const { vars } = serviceEnv(fileEnv);
    const created = await call('POST', '/services', {
      type: 'web_service',
      name: SERVICE_NAME,
      ownerId: owner.id,
      repo: repoUrl(gitOrigin()),
      branch,
      autoDeployTrigger: 'commit',
      buildFilter: BUILD_FILTER,
      envVars: toEnvList(vars),
      serviceDetails: {
        runtime: 'docker',
        plan: 'free',
        region,
        healthCheckPath: '/ready',
        envSpecificDetails: { dockerfilePath: './packages/api/Dockerfile', dockerContext: '.' },
      },
    });
    service = created.service ?? created;
    say(`Made ${SERVICE_NAME} on the free plan in ${region}.`);
  }

  if (service.suspended === 'suspended') {
    throw new Error(`Render has suspended ${SERVICE_NAME}. Free services are suspended when the month's free hours or bandwidth run out. Resume it in the Render dashboard.`);
  }
  if (!service.serviceDetails?.url) service = await call('GET', `/services/${service.id}`);
  const apiUrl = String(service.serviceDetails?.url ?? '').replace(/\/$/, '');
  if (!apiUrl.startsWith('https://')) throw new Error('Render did not report an https address for the service.');

  const { vars, localOnly, leftOut } = serviceEnv(fileEnv, apiUrl);
  say(`Names Render gets. ${Object.keys(vars).join(', ')}`);
  if (localOnly.length) say(`Left out because they point at this Mac. ${localOnly.join(', ')}`);
  if (leftOut.length) say(`Left out because the API does not use them there. ${leftOut.join(', ')}`);

  const existing = await readServiceEnv(call, service.id);
  const { merged, changed } = mergeEnv(existing, vars);
  if (changed.length) {
    await call('PUT', `/services/${service.id}/env-vars`, toEnvList(merged));
    say(`Updated on Render. ${changed.join(', ')}`);
  } else {
    say('Every setting on Render already matches .env.');
  }

  const latest = await latestDeploy(call, service.id);
  const plan = deployPlan(changed.length > 0, latest);
  let deployId = latest?.id;
  if (plan === 'replace') {
    await call('POST', `/services/${service.id}/deploys/${latest.id}/cancel`).catch(() => {});
  }
  if (plan === 'deploy' || plan === 'replace') {
    say('Starting a deploy. A first build on the free plan can take 10 minutes or more.');
    deployId = (await startDeploy(call, service.id, latest)).id;
  } else {
    say('No new deploy is needed.');
  }
  await waitForDeploy(call, service.id, deployId, say);

  say('Waiting for the health path.');
  if (!(await waitForPath(`${apiUrl}/health`, 5))) {
    throw new Error(`${apiUrl}/health did not answer in 5 minutes. Open taro-api in the Render dashboard and read its Logs.`);
  }
  if (!(await waitForPath(`${apiUrl}/ready`, 3))) {
    throw new Error('The API is up but cannot reach MongoDB. In MongoDB Atlas, open Network Access and allow access from anywhere, then run this again.');
  }

  console.log(`\nThe Taro API is live at ${apiUrl}\n`);
  console.log('What is left for you');
  console.log(`1. On Vercel set NEXT_PUBLIC_API_URL to ${apiUrl} and redeploy the dashboard.`);
  console.log('2. Add these redirect URLs.');
  for (const [label, url] of redirectUrls(apiUrl, vars)) console.log(`   ${label.padEnd(26)} ${url}`);
  console.log(`3. Point a free UptimeRobot monitor at ${apiUrl}/health every 5 minutes.`);
  console.log('docs/DEPLOY.md has every step.');
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().catch((error) => {
    let fileEnv = {};
    try {
      fileEnv = readEnvFile(ENV_FILE);
    } catch {}
    console.error(`\n${makeRedactor(fileEnv)(error instanceof Error ? error.message : error)}`);
    process.exitCode = 1;
  });
}
