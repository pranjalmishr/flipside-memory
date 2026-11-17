const { mkdir, writeFile, rename } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const ROOT = 'flipsideDaily/v1/';
let cloudPromise;
let credentialWork = Promise.resolve();
async function writeAtomic(path, content) {
  const temporary = `${path}.${randomUUID()}`;
  await writeFile(temporary, content, { mode: 0o600 }); await rename(temporary, path);
}
async function credentials() {
  if (process.env.VERCEL !== '1') return;
  const audience = process.env.FLIPSIDE_WIF_AUDIENCE, serviceAccount = process.env.FLIPSIDE_SERVICE_ACCOUNT;
  if (!audience || !serviceAccount) throw new Error('Daily server federation is not configured');
  credentialWork = credentialWork.catch(() => {}).then(async () => {
    const { getVercelOidcToken } = await import('@vercel/functions/oidc');
    const dir = join(tmpdir(), 'flipside-identity'); await mkdir(dir, { recursive: true, mode: 0o700 });
    const tokenFile = join(dir, 'subject-token'), credentialFile = join(dir, 'external-account.json');
    await writeAtomic(tokenFile, await getVercelOidcToken());
    await writeAtomic(credentialFile, JSON.stringify({ type: 'external_account', audience,
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt', token_url: 'https://sts.googleapis.com/v1/token',
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccount}:generateAccessToken`,
      credential_source: { file: tokenFile } }));
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialFile;
  });
  await credentialWork;
}
function checkPath(path) { if (!path.startsWith(ROOT)) throw new Error('Outside FlipSide namespace'); }
async function getCloud() {
  await credentials();
  cloudPromise ||= Promise.resolve().then(async () => {
    const { initializeApp, applicationDefault, getApps } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    const { getAuth } = await import('firebase-admin/auth');
    const app = getApps().find(app => app.name === 'flipside-daily') || initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'nitre-d8cdd', credential: applicationDefault() }, 'flipside-daily');
    const db = getFirestore(app), auth = getAuth(app);
    const store = {
      transaction: callback => db.runTransaction(async transaction => {
        const writes = [];
        const tx = {
          getAll: async paths => { paths.forEach(checkPath); const docs = await transaction.getAll(...paths.map(p => db.doc(p))); return docs.map(d => d.exists ? d.data() : null); },
          set: (path, value) => { checkPath(path); writes.push([path, JSON.parse(JSON.stringify(value))]); },
        };
        const result = await callback(tx);
        for (const [path, value] of writes) transaction.set(db.doc(path), value);
        return result;
      }, { maxAttempts: 8 }),
      leaderboard: async (path, limit) => { checkPath(path); const docs = await db.collection(path).orderBy('rankKey').limit(limit).get(); return docs.docs.map(d => d.data()); },
      rank: async (path, key) => { checkPath(path); const result = await db.collection(path).where('rankKey', '<', key).count().get(); return result.data().count + 1; },
    };
    return { store, auth };
  }).catch(error => { cloudPromise = null; throw error; });
  return cloudPromise;
}
module.exports = { getCloud, checkPath };
