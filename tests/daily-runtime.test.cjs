const { test } = require('node:test');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');

test('daily production dependencies load without experimental CommonJS-to-ESM interop', () => {
  const output = execFileSync(process.execPath, ['--no-experimental-require-module', '-e',
    "Promise.all([import('@vercel/functions/oidc'),import('firebase-admin/app'),import('firebase-admin/firestore'),import('firebase-admin/auth')]).then(()=>console.log('OK')).catch(error=>{console.error(error.message);process.exitCode=1})"],
    { cwd: require('node:path').resolve(__dirname, '..'), encoding: 'utf8' });
  assert.match(output, /OK/);
});
