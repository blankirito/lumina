import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
export const STAGING_URL = 'https://udhymvnzvsejrzpuninp.supabase.co';
const MAGIC = Buffer.from('LUMINA-RECOVERY-1\n');
const NAMES = ['database','auth','schema','storage','config','migrations'];
const MAX_BYTES = 64 * 1024 * 1024;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function assertStagingTarget(target) {
  if (target !== STAGING_URL) throw new Error('Only the exact synthetic staging target is permitted');
  return target;
}
function validateIdentity(target, fixture) {
  assertStagingTarget(target);
  if (!/^lumina-recovery-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(fixture))
    throw new Error('A dedicated synthetic fixture ID is required');
}
function validateKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('A 32-byte random key is required');
}
function validateComponents(components) {
  if (!components || Object.keys(components).sort().join() !== [...NAMES].sort().join())
    throw new Error('All six recovery components are required');
  let size = 0;
  for (const name of NAMES) {
    if (!Buffer.isBuffer(components[name]) || !components[name].length) throw new Error('Empty or invalid component');
    size += components[name].length;
  }
  if (size > MAX_BYTES / 2) throw new Error('Synthetic drill size limit exceeded');
}
export function seal({target,fixture,createdAt,components}, key) {
  validateIdentity(target,fixture); validateKey(key); validateComponents(components);
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error('Invalid checkpoint time');
  const records = NAMES.map(name => ({name, bytes:components[name].length, hash:sha256(components[name]), data:components[name].toString('base64')}));
  const payload = Buffer.from(JSON.stringify({version:1,scope:'synthetic-fixture',target,fixture,createdAt,records}));
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm',key,nonce);
  cipher.setAAD(MAGIC);
  const ciphertext = Buffer.concat([cipher.update(payload),cipher.final()]);
  return Buffer.concat([MAGIC,nonce,cipher.getAuthTag(),ciphertext]);
}
export function open(encrypted,key,{target,fixture}) {
  validateIdentity(target,fixture); validateKey(key);
  if (!Buffer.isBuffer(encrypted) || encrypted.length > MAX_BYTES ||
      encrypted.length < MAGIC.length + 29 || !encrypted.subarray(0,MAGIC.length).equals(MAGIC))
    throw new Error('Invalid recovery envelope');
  const offset = MAGIC.length;
  const decipher = createDecipheriv('aes-256-gcm',key,encrypted.subarray(offset,offset+12));
  decipher.setAAD(MAGIC); decipher.setAuthTag(encrypted.subarray(offset+12,offset+28));
  const data = JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(offset+28)),decipher.final()]).toString('utf8'));
  if (data.version !== 1 || data.scope !== 'synthetic-fixture' || data.target !== target ||
      data.fixture !== fixture || !Number.isFinite(Date.parse(data.createdAt)) || !Array.isArray(data.records))
    throw new Error('Recovery manifest identity mismatch');
  const components = {};
  for (const record of data.records) {
    if (!NAMES.includes(record.name) || Object.hasOwn(components,record.name) || typeof record.data !== 'string')
      throw new Error('Invalid component manifest');
    const bytes = Buffer.from(record.data,'base64');
    if (bytes.length !== record.bytes || sha256(bytes) !== record.hash || bytes.toString('base64') !== record.data)
      throw new Error('Component integrity mismatch');
    components[record.name]=bytes;
  }
  validateComponents(components);
  return {target,fixture,createdAt:data.createdAt,components};
}
// Planning only: no delete API. An unverified archive is never a replacement recovery point.
export function retentionPlan(entries,now,days) {
  if (!(now instanceof Date) || !Number.isFinite(+now) || !Number.isInteger(days) || days < 1)
    throw new Error('Invalid retention window');
  const ids = new Set();
  for (const entry of entries) {
    if (!entry.id || ids.has(entry.id) || !Number.isFinite(Date.parse(entry.createdAt)) ||
        Date.parse(entry.createdAt)>+now || typeof entry.verified !== 'boolean' ||
        !Array.isArray(entry.objects) || entry.objects.some(x=>typeof x!=='string'))
      throw new Error('Invalid retention inventory');
    ids.add(entry.id);
  }
  const verified=entries.filter(x=>x.verified).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  const keep=verified.filter((x,i)=>i===0 || Date.parse(x.createdAt)>=+now-days*86400000);
  const keepIds=new Set(keep.map(x=>x.id));
  return {keep:[...keepIds],expire:verified.filter(x=>!keepIds.has(x.id)).map(x=>x.id),
    protectedObjects:[...new Set(keep.flatMap(x=>x.objects))].sort(),
    unverified:entries.filter(x=>!x.verified).map(x=>x.id)};
}
