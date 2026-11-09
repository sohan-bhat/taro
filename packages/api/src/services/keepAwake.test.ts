import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepAwakeTarget } from './keepAwake';

test('builds the health URL from a public https address', () => {
  assert.equal(keepAwakeTarget('https://taro.onrender.com'), 'https://taro.onrender.com/health');
  assert.equal(keepAwakeTarget('https://taro.onrender.com/'), 'https://taro.onrender.com/health');
});

test('stays off without a public https address', () => {
  assert.equal(keepAwakeTarget(''), null);
  assert.equal(keepAwakeTarget('http://localhost:4000'), null);
});
