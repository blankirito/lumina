import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import * as route from '../../app/api/cron/route';

type Job = { id: string; store_id: string; payment_method_id: string; storage_path: string; attempts: number };
const approved: Job[] = [
  { id: '1d1d3454-7c67-46b1-aed7-6e80d24979ae', store_id: 'b1e92d84-6517-4d51-a2e7-b78ce78dae0e', payment_method_id: '42a643c5-06e2-4053-bf3e-d5eaed1e2841', storage_path: 'stores/b1e92d84-6517-4d51-a2e7-b78ce78dae0e/payment-methods/42a643c5-06e2-4053-bf3e-d5eaed1e2841/cfb677fc-3f13-4012-a37e-ec8d66003aa6.png', attempts: 0 },
  { id: '4d800f71-8880-4312-99b7-65a9c6ffab3c', store_id: '4da89ba8-3eb6-40fb-9a7f-1e68a1f58c93', payment_method_id: '7d27d546-0f9f-448b-a3c9-b31a424e8c61', storage_path: 'stores/4da89ba8-3eb6-40fb-9a7f-1e68a1f58c93/payment-methods/7d27d546-0f9f-448b-a3c9-b31a424e8c61/9f4fb6c9-3c11-47cf-943f-c8a8305e58df.png', attempts: 0 },
];
const foreign: Job = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', store_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', payment_method_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', storage_path: 'stores/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/payment-methods/cccccccc-cccc-4ccc-8ccc-cccccccccccc/dddddddd-dddd-4ddd-8ddd-dddddddddddd.png', attempts: 0 };
const state = vi.hoisted(() => ({
  factory: null as null | (() => unknown), jobs: [] as Job[], objects: new Set<string>(),
  requests: [] as string[], afterRead: null as null | (() => void),
  failStorage: false, failAck: false, failRead: false, duplicateRead: false,
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => state.factory!() }));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// Exercise the real route AND Supabase query builder. Replace only remote HTTP.
async function transport(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname !== 'synthetic.invalid') throw new Error('Unexpected network target');
  const method = init?.method ?? 'GET';
  state.requests.push(method + ' ' + url.pathname);
  if (url.pathname === '/rest/v1/payment_qr_cleanup_jobs') {
    const matches = (job: Job) => [...url.searchParams].every(([key, filter]) => {
      if (!['id', 'storage_path', 'store_id', 'payment_method_id', 'attempts'].includes(key)) return true;
      const value = String(job[key as keyof Job]);
      return filter.startsWith('eq.') ? value === filter.slice(3) : filter.startsWith('in.(') ? filter.slice(4, -1).split(',').includes(value) : false;
    });
    if (method === 'GET') {
      if (state.failRead) return json({ message: 'PRIVATE read failure' }, 500);
      let rows = structuredClone(state.jobs.filter(matches));
      if (state.duplicateRead) rows = [rows[0], rows[0]];
      state.afterRead?.();
      return json(rows);
    }
    if (method === 'DELETE') {
      if (state.failAck) return json({ message: 'PRIVATE ack failure' }, 500);
      const rows = state.jobs.filter(matches);
      state.jobs = state.jobs.filter(job => !matches(job));
      return json(rows.map(job => ({ id: job.id })));
    }
    throw new Error('Unexpected queue mutation');
  }
  if (url.pathname === '/storage/v1/object/payment-qr-codes' && method === 'DELETE') {
    if (state.failStorage) return json({ message: 'PRIVATE storage failure' }, 500);
    const paths = JSON.parse(String(init?.body)).prefixes as string[];
    paths.forEach(path => state.objects.delete(path));
    return json(paths.map(name => ({ name })));
  }
  throw new Error('Unexpected endpoint');
}

async function run(headers: Record<string, string> = {}, query = '', body?: string) {
  expect(route).toHaveProperty('POST', expect.any(Function));
  return route.POST(new Request('https://synthetic.invalid/api/cron' + query, {
    method: 'POST', body,
    headers: { authorization: 'Bearer synthetic-cron', 'x-lumina-r1-verify': 'exact-two-qr-jobs', ...headers },
  }));
}

describe('R1 exact two-job verification', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'synthetic-cron');
    state.jobs = structuredClone(approved);
    state.objects = new Set([...approved, foreign].map(job => job.storage_path));
    state.requests = [];
    state.afterRead = null;
    state.failStorage = state.failAck = state.failRead = state.duplicateRead = false;
    state.factory = () => createClient('https://synthetic.invalid', 'synthetic-service', {
      auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: transport },
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('rejects an incorrect secret before any dependency access', async () => {
    expect((await run({ authorization: 'Bearer wrong' })).status).toBe(401);
    expect(state.requests).toEqual([]);
  });
  it('rejects missing server secret', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await run()).status).toBe(401);
    expect(state.requests).toEqual([]);
  });
  it('requires explicit verification intent', async () => {
    expect((await run({ 'x-lumina-r1-verify': '' })).status).toBe(400);
    expect(state.requests).toEqual([]);
  });
  it.each([['?id=' + foreign.id, undefined], ['', '{"ids":["unrelated"]}']])('does not accept caller-selected targets', async (query, body) => {
    expect((await run({}, query, body)).status).toBe(400);
    expect(state.requests).toEqual([]);
  });
  it('deletes exactly the two approved files and rows, preserving an unrelated job', async () => {
    state.jobs.push(structuredClone(foreign));
    const response = await run();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: 2, removed: 2, failed: 0, skipped: 0, persistenceFailed: 0 });
    expect(state.jobs).toEqual([foreign]);
    expect([...state.objects]).toEqual([foreign.storage_path]);
  });
  it('does not process unrelated jobs inserted concurrently after the read', async () => {
    state.afterRead = () => state.jobs.push(structuredClone(foreign));
    expect((await run()).status).toBe(200);
    expect(state.jobs).toEqual([foreign]);
    expect([...state.objects]).toEqual([foreign.storage_path]);
  });
  it.each(['storage_path', 'store_id', 'payment_method_id', 'attempts'] as const)('validates every selected row before first mutation: %s', async key => {
    Object.assign(state.jobs[1], { [key]: key === 'attempts' ? 1 : foreign[key] });
    expect((await run()).status).toBe(409);
    expect(state.objects.size).toBe(3);
    expect(state.requests.every(r => r.startsWith('GET '))).toBe(true);
  });
  it('fails closed if either approved job is missing', async () => {
    state.jobs.pop();
    expect((await run()).status).toBe(409);
    expect(state.objects.size).toBe(3);
  });
  it('fails closed for duplicate response IDs', async () => {
    state.duplicateRead = true;
    expect((await run()).status).toBe(409);
    expect(state.objects.size).toBe(3);
  });
  it('does not follow a concurrently retargeted row or delete its replacement', async () => {
    state.afterRead = () => { Object.assign(state.jobs[0], { storage_path: foreign.storage_path }); };
    const response = await run();
    expect(response.status).toBe(409);
    expect(state.jobs).toHaveLength(2);
    expect(state.jobs[0].storage_path).toBe(foreign.storage_path);
    expect(state.objects.has(foreign.storage_path)).toBe(true);
    expect(state.objects.has(approved[1].storage_path)).toBe(true);
  });
  it.each(['failStorage', 'failAck', 'failRead'] as const)('stops on %s without touching the second file or leaking diagnostics', async key => {
    state[key] = true;
    const response = await run();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toMatch(/PRIVATE|synthetic-cron/);
    expect(state.objects.has(approved[1].storage_path)).toBe(true);
    expect(state.jobs).toHaveLength(2);
  });
});
