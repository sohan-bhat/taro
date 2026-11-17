import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  deployPlan,
  makeRedactor,
  mergeEnv,
  missingSettings,
  redirectUrls,
  repoUrl,
  serviceEnv,
  toEnvList,
} from './render-cutover.mjs';

const fileEnv = {
  RENDER_API_KEY: 'rnd_fake_key_value',
  MONGODB_URI: 'mongodb+srv://user:pass@example.mongodb.net/taro',
  ENCRYPTION_KEY: 'ZmFrZS1lbmNyeXB0aW9uLWtleS1mb3ItdGVzdHM=',
  API_URL: 'https://old-tunnel.example.app',
  APP_URL: 'https://dashboard.example.app',
  SLACK_CLIENT_ID: '123.456',
  SLACK_CLIENT_SECRET: 'fake-slack-secret',
  GOOGLE_API_KEY: 'unused-google-key',
  GROQ_API_KEY: 'unused-groq-key',
  STT_WS_URL: 'ws://localhost:8012',
};

test('sends only what the API reads, with production settings', () => {
  const { vars, localOnly, leftOut } = serviceEnv(fileEnv, 'https://taro-api.onrender.com');
  assert.equal(vars.NODE_ENV, 'production');
  assert.equal(vars.PORT, '10000');
  assert.equal(vars.API_URL, 'https://taro-api.onrender.com');
  assert.equal(vars.APP_URL, fileEnv.APP_URL);
  assert.equal(vars.MONGODB_URI, fileEnv.MONGODB_URI);
  assert.equal(vars.RENDER_API_KEY, undefined);
  assert.equal(vars.GOOGLE_API_KEY, undefined);
  assert.deepEqual(localOnly, ['STT_WS_URL']);
  assert.deepEqual(leftOut.sort(), ['GOOGLE_API_KEY', 'GROQ_API_KEY', 'RENDER_API_KEY']);
});

test('leaves API_URL out until the address is known', () => {
  assert.equal(serviceEnv(fileEnv).vars.API_URL, undefined);
});

test('falls back to NEXT_PUBLIC_APP_URL for APP_URL', () => {
  const { vars } = serviceEnv({ NEXT_PUBLIC_APP_URL: 'https://dashboard.example.app' });
  assert.equal(vars.APP_URL, 'https://dashboard.example.app');
});

test('merging keeps settings added on Render and lists what changed', () => {
  const { merged, changed } = mergeEnv({ EXTRA: 'kept', PORT: '10000', API_URL: 'https://old.example' }, { PORT: '10000', API_URL: 'https://new.example' });
  assert.deepEqual(merged, { EXTRA: 'kept', PORT: '10000', API_URL: 'https://new.example' });
  assert.deepEqual(changed, ['API_URL']);
  assert.deepEqual(mergeEnv({ A: '1' }, { A: '1' }).changed, []);
});

test('a second run with nothing new starts no deploy', () => {
  assert.equal(deployPlan(false, { id: 'dep-1', status: 'live' }), 'wait');
  assert.equal(deployPlan(false, { id: 'dep-1', status: 'build_in_progress' }), 'wait');
  assert.equal(deployPlan(false, { id: 'dep-1', status: 'build_failed' }), 'deploy');
  assert.equal(deployPlan(true, { id: 'dep-1', status: 'live' }), 'deploy');
  assert.equal(deployPlan(true, { id: 'dep-1', status: 'build_in_progress' }), 'replace');
  assert.equal(deployPlan(false, null), 'deploy');
});

test('the redactor hides every long value from .env', () => {
  const redact = makeRedactor(fileEnv);
  const text = redact(`bad ${fileEnv.MONGODB_URI} and ${fileEnv.SLACK_CLIENT_SECRET} on port 10000`);
  assert.ok(!text.includes(fileEnv.MONGODB_URI));
  assert.ok(!text.includes(fileEnv.SLACK_CLIENT_SECRET));
  assert.ok(text.includes('[hidden]'));
  assert.ok(text.includes('10000'));
});

test('repo addresses become plain https links without credentials', () => {
  assert.equal(repoUrl('https://github.com/acme/taro.git\n'), 'https://github.com/acme/taro');
  assert.equal(repoUrl('git@github.com:acme/taro.git'), 'https://github.com/acme/taro');
  assert.equal(repoUrl('ssh://git@github.com/acme/taro.git'), 'https://github.com/acme/taro');
  assert.equal(repoUrl('https://user:token@github.com/acme/taro'), 'https://github.com/acme/taro');
});

test('reports what .env still needs', () => {
  assert.deepEqual(missingSettings(fileEnv), []);
  assert.deepEqual(missingSettings({ MONGODB_URI: 'x', ENCRYPTION_KEY: 'y', GOOGLE_CLIENT_ID: 'g' }), [
    'RENDER_API_KEY',
    'SLACK_CLIENT_ID and SLACK_CLIENT_SECRET, or GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET',
  ]);
});

test('lists redirect URLs only for connected apps', () => {
  const urls = redirectUrls('https://taro-api.onrender.com', { SLACK_CLIENT_ID: 'a', LINEAR_CLIENT_ID: 'b' }).map(([, url]) => url);
  assert.deepEqual(urls, [
    'https://taro-api.onrender.com/api/auth/slack/callback',
    'https://taro-api.onrender.com/api/slack/callback',
    'https://taro-api.onrender.com/api/linear/callback',
  ]);
});

test('env lists use the shape Render takes', () => {
  assert.deepEqual(toEnvList({ A: '1' }), [{ key: 'A', value: '1' }]);
});
