import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { seal, open, assertStagingTarget, retentionPlan } from './bundle.mjs';

const target = 'https://udhymvnzvsejrzpuninp.supabase.co';
const fixture = 'lumina-recovery-10000000-0000-4000-8000-000000000001';
const key = randomBytes(32);
const input = () => ({
  target, fixture, createdAt: '2026-10-22T03:00:00.000Z',
  components: Object.fromEntries(['database','auth','schema','storage','config','migrations'].map(name => [name, Buffer.from(name + ':synthetic-private-content')]))
});
test('encrypted bundle round-trips all six components without plaintext disclosure', () => {
  const encrypted = seal(input(), key);
  assert.equal(encrypted.includes(Buffer.from('synthetic-private-content')), false);
  const result = open(encrypted, key, {target, fixture});
  assert.equal(result.components.auth.toString(), 'auth:synthetic-private-content');
  assert.deepEqual(Object.keys(result.components).sort(), ['auth','config','database','migrations','schema','storage']);
});
test('tampered ciphertext and wrong key cannot be restored', () => {
  const encrypted = seal(input(), key);
  const altered = Buffer.from(encrypted); altered[altered.length - 8] ^= 1;
  assert.throws(() => open(altered, key, {target, fixture}));
  assert.throws(() => open(encrypted, randomBytes(32), {target, fixture}));
});
test('production, disguised hosts, credentials and redirects are rejected before networking', () => {
  for (const url of [
    'https://xsjcmrlwdpudrkjhghdl.supabase.co',
    target + '.evil.example', target + '/path',
    'http://udhymvnzvsejrzpuninp.supabase.co',
    'https://user:pass@udhymvnzvsejrzpuninp.supabase.co',
    target + ':443', target + '?x=1'
  ]) assert.throws(() => assertStagingTarget(url));
  assert.equal(assertStagingTarget(target), target);
});
test('wrong fixture or project cannot reuse a valid encrypted archive', () => {
  const encrypted = seal(input(), key);
  assert.throws(() => open(encrypted, key, {target, fixture:fixture.replace(/1$/, '2')}));
  assert.throws(() => seal({...input(),target:'https://xsjcmrlwdpudrkjhghdl.supabase.co'},key));
});
test('missing or empty components are never a complete backup', () => {
  const data = input(); delete data.components.storage;
  assert.throws(() => seal(data,key));
  const empty = input(); empty.components.auth = Buffer.alloc(0);
  assert.throws(() => seal(empty,key));
  assert.throws(() => seal({...input(),fixture:'../../escape'},key));
});
test('retention keeps referenced object versions and last verified point', () => {
  const now = new Date('2026-10-22T00:00:00Z');
  const plan = retentionPlan([
    {id:'old',createdAt:'2026-08-01T00:00:00Z',verified:true,objects:['old-only','shared']},
    {id:'recent',createdAt:'2026-10-21T00:00:00Z',verified:true,objects:['shared','new']},
    {id:'failed',createdAt:'2026-10-22T00:00:00Z',verified:false,objects:['partial']}
  ],now,30);
  assert.deepEqual(plan.keep,['recent']);
  assert.deepEqual(plan.expire,['old']);
  assert.deepEqual(plan.protectedObjects,['new','shared']);
  assert.deepEqual(plan.unverified,['failed']);
  assert.deepEqual(retentionPlan([{id:'only',createdAt:'2026-01-01T00:00:00Z',verified:true,objects:['x']}],now,30).expire,[]);
});
test('retention refuses ambiguous or future-dated inventories', () => {
  const item={id:'a',createdAt:'2026-10-21T00:00:00Z',verified:true,objects:[]};
  assert.throws(()=>retentionPlan([item,item],new Date('2026-10-22T00:00:00Z'),30));
  assert.throws(()=>retentionPlan([item],new Date('2025-10-22T00:00:00Z'),30));
  assert.throws(()=>retentionPlan([item],new Date(),0));
});
