/* Authorized provisioning only. Never deploys developer credentials or changes Firestore rules. */
const { existsSync, readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { homedir } = require('node:os');
const { randomBytes, createHash } = require('node:crypto');
const project = 'nitre-d8cdd';
const link = JSON.parse(readFileSync(join(__dirname, '../.vercel/project.json'), 'utf8'));
const teamId = link.orgId, vercelProjectId = link.projectId;
const teamSlug = 'pranjal-mishras-projects-52970ad6';
const accountId = 'flipside-vercel';
const serviceAccount = `${accountId}@${project}.iam.gserviceaccount.com`;
async function developerGoogleToken() {
  const folder = join(homedir(), '.config/firebase');
  const file = readdirSync(folder).find(name => name.endsWith('application_default_credentials.json'));
  if (!file) throw new Error('Firebase CLI authentication is unavailable');
  const c = JSON.parse(readFileSync(join(folder, file), 'utf8'));
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: c.refresh_token, grant_type: 'refresh_token' }) });
  if (!response.ok) throw new Error(`Google authentication refresh failed (${response.status})`);
  return (await response.json()).access_token;
}
async function run() {
  const googleToken = await developerGoogleToken();
  const vercelToken = JSON.parse(readFileSync(join(homedir(), 'Library/Application Support/com.vercel.cli/auth.json'), 'utf8')).token;
  async function request(url, token, method = 'GET', body, absent = false) {
    const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(url.includes('googleapis.com') ? { 'x-goog-user-project': project } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = await response.json().catch(() => ({}));
    if (absent && response.status === 404) return null;
    if (!response.ok) throw new Error(`${method} ${new URL(url).pathname}: ${response.status} ${value.error?.status || 'request failed'} ${value.error?.message || ''}`);
    return value;
  }
  const g = (path, method, body, absent) => request(`https://${path}`, googleToken, method, body, absent);
  const v = (path, method, body) => request(`https://api.vercel.com/${path}${path.includes('?') ? '&' : '?'}teamId=${teamId}`, vercelToken, method, body);
  const billing = await g(`cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`).catch(error => {
    if (/SERVICE_DISABLED|has not been used/.test(error.message)) return { billingEnabled: false };
    throw error;
  });
  if (billing.billingEnabled) throw new Error('Billing is enabled; refusing this Spark-only setup.');
  const resource = await g(`cloudresourcemanager.googleapis.com/v1/projects/${project}`);
  const number = resource.projectNumber;
  const pool = `projects/${number}/locations/global/workloadIdentityPools/${accountId}`;
  const provider = `${pool}/providers/vercel`;
  // Snapshot the live rules before provisioning. No rules mutation is required: daily data is server-only.
  const release = await g(`firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`);
  const rulesBefore = await g(`firebaserules.googleapis.com/v1/${release.rulesetName}`);
  const sourceHash = value => createHash('sha256').update(JSON.stringify(value.source)).digest('hex');
  const beforeHash = sourceHash(rulesBefore);
  await v(`v9/projects/${vercelProjectId}`, 'PATCH', { oidcTokenConfig: { enabled: true, issuerMode: 'team' } });
  const accounts = await g(`iam.googleapis.com/v1/projects/${project}/serviceAccounts?pageSize=100`);
  if (!accounts.accounts?.some(account => account.email === serviceAccount)) await g(`iam.googleapis.com/v1/projects/${project}/serviceAccounts`, 'POST', { accountId, serviceAccount: { displayName: 'FlipSide daily Vercel runtime (keyless)' } });
  if (!await g(`iam.googleapis.com/v1/${pool}`, 'GET', undefined, true)) await g(`iam.googleapis.com/v1/projects/${number}/locations/global/workloadIdentityPools?workloadIdentityPoolId=${accountId}`, 'POST', { displayName: 'FlipSide daily only' });
  if (!await g(`iam.googleapis.com/v1/${provider}`, 'GET', undefined, true)) await g(`iam.googleapis.com/v1/${pool}/providers?workloadIdentityPoolProviderId=vercel`, 'POST', {
    displayName: 'FlipSide production only', attributeMapping: { 'google.subject': 'assertion.sub', 'attribute.project_id': 'assertion.project_id' },
    attributeCondition: `assertion.owner_id == '${teamId}' && assertion.project_id == '${vercelProjectId}' && assertion.environment == 'production'`,
    oidc: { issuerUri: `https://oidc.vercel.com/${teamSlug}`, allowedAudiences: [`https://vercel.com/${teamSlug}`] } });
  const principal = `principalSet://iam.googleapis.com/${pool}/attribute.project_id/${vercelProjectId}`;
  const saResource = `projects/${project}/serviceAccounts/${serviceAccount}`;
  const saPolicy = await g(`iam.googleapis.com/v1/${saResource}:getIamPolicy`, 'POST', {});
  saPolicy.bindings ||= [];
  let binding = saPolicy.bindings.find(b => b.role === 'roles/iam.workloadIdentityUser');
  if (!binding) saPolicy.bindings.push(binding = { role: 'roles/iam.workloadIdentityUser', members: [] });
  if (!binding.members.includes(principal)) { binding.members.push(principal); await g(`iam.googleapis.com/v1/${saResource}:setIamPolicy`, 'POST', { policy: saPolicy }); }
  const policy = await g(`cloudresourcemanager.googleapis.com/v1/projects/${project}:getIamPolicy`, 'POST', { options: { requestedPolicyVersion: 3 } });
  policy.bindings ||= [];
  let datastore = policy.bindings.find(b => b.role === 'roles/datastore.user' && !b.condition);
  if (!datastore) policy.bindings.push(datastore = { role: 'roles/datastore.user', members: [] });
  if (!datastore.members.includes(`serviceAccount:${serviceAccount}`)) {
    datastore.members.push(`serviceAccount:${serviceAccount}`);
    await g(`cloudresourcemanager.googleapis.com/v1/projects/${project}:setIamPolicy`, 'POST', { policy });
  }
  const apps = await g(`firebase.googleapis.com/v1beta1/projects/${project}/webApps`);
  const firstApp = apps.apps?.[0];
  if (!firstApp) throw new Error('The existing Firebase web application was not found');
  const firebaseConfig = await g(`firebase.googleapis.com/v1beta1/${firstApp.name}/config`);
  const existingEnv = await v(`v9/projects/${vercelProjectId}/env`);
  const values = { FIREBASE_PROJECT_ID: project, FLIPSIDE_SERVICE_ACCOUNT: serviceAccount, FLIPSIDE_WIF_AUDIENCE: `//iam.googleapis.com/${provider}`, FLIPSIDE_FIREBASE_API_KEY: firebaseConfig.apiKey };
  for (const [key, value] of Object.entries(values)) await v(`v10/projects/${vercelProjectId}/env?upsert=true`, 'POST', { key, value, type: 'plain', target: ['production'] });
  if (!existingEnv.envs?.some(e => e.key === 'FLIPSIDE_DAILY_SEED')) await v(`v10/projects/${vercelProjectId}/env`, 'POST', { key: 'FLIPSIDE_DAILY_SEED', value: randomBytes(32).toString('hex'), type: 'encrypted', target: ['production'] });
  const currentRelease = await g(`firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`);
  const rulesAfter = await g(`firebaserules.googleapis.com/v1/${currentRelease.rulesetName}`);
  if (sourceHash(rulesAfter) !== beforeHash) throw new Error('Live rules changed during provisioning; inspect before proceeding.');
  console.log(JSON.stringify({ project, vercelProjectId, serviceAccount, billing: 'disabled', firestoreRules: 'unchanged', rulesSourceSha256: beforeHash, identity: 'production-only keyless federation', namespace: 'flipsideDaily/v1' }, null, 2));
}
if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { developerGoogleToken };
