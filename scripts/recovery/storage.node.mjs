import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStagingStorageClient} from './staging-storage.mjs';
const cfg={target:'https://udhymvnzvsejrzpuninp.supabase.co',fixture:'lumina-recovery-10000000-0000-4000-8000-000000000001',
  userId:'10000000-0000-4000-8000-000000000002',storeId:'20000000-0000-4000-8000-000000000001',
  productId:'30000000-0000-4000-8000-000000000001',key:'public-test-key',password:'synthetic-only'};
test('production and malformed fixture scopes cause zero network requests',async()=>{
  let calls=0; const transport=async()=>{calls++; throw new Error('must not run');};
  assert.throws(()=>createStagingStorageClient({...cfg,target:'https://xsjcmrlwdpudrkjhghdl.supabase.co'},transport));
  assert.throws(()=>createStagingStorageClient({...cfg,storeId:'../../other'},transport));
  assert.throws(()=>createStagingStorageClient({...cfg,fixture:'real-customer'},transport));
  assert.equal(calls,0);
});
test('wrong authenticated user cannot upload or delete an object',async()=>{
  const client=createStagingStorageClient(cfg,async()=>new Response(JSON.stringify({access_token:'synthetic',user:{id:'someone-else',email:'x'}})));
  await assert.rejects(client.signIn(),/identity/);
  await assert.rejects(client.upload(Buffer.from('x')),/sign in/i);
  await assert.rejects(client.remove(),/sign in/i);
});
test('only exact fixture object is addressed; redirects disabled; no raw API error leaks',async()=>{
  const requests=[];
  const client=createStagingStorageClient(cfg,async(url,options)=>{
    requests.push({url,options});
    if(url.endsWith('/auth/v1/token?grant_type=password'))return new Response(JSON.stringify({access_token:'synthetic',user:{id:cfg.userId,email:cfg.fixture+'@example.invalid'}}));
    if(options.method==='POST')return new Response('{}');
    if(options.method==='DELETE')return new Response(JSON.stringify({message:'secret-value'}),{status:500});
    return new Response(Buffer.from([1,2,3]),{headers:{'content-type':'image/png'}});
  });
  await client.signIn(); await client.upload(Buffer.from([1,2,3]));
  assert.deepEqual(await client.download(),Buffer.from([1,2,3]));
  await assert.rejects(client.remove(),e=>e.message==='Staging Storage request failed (500)');
  assert.ok(requests.every(x=>x.options.redirect==='error'));
  const deletion=requests.find(x=>x.options.method==='DELETE');
  assert.deepEqual(JSON.parse(deletion.options.body),{prefixes:[client.objectKey]});
  assert.equal(client.objectKey,'stores/'+cfg.storeId+'/products/'+cfg.productId+'/'+cfg.fixture+'.png');
});
test('oversize downloads are rejected',async()=>{
  const client=createStagingStorageClient(cfg,async(url)=>url.includes('/token?')?
    new Response(JSON.stringify({access_token:'synthetic',user:{id:cfg.userId,email:cfg.fixture+'@example.invalid'}})):
    new Response('large',{headers:{'content-length':'99999999'}}));
  await client.signIn(); await assert.rejects(client.download(),/size/i);
});
test('empty successful deletion response is not a deleted object',async()=>{
  const client=createStagingStorageClient(cfg,async(url)=>url.includes('/token?')?
    new Response(JSON.stringify({access_token:'synthetic',user:{id:cfg.userId,email:cfg.fixture+'@example.invalid'}})):
    new Response('[]'));
  await client.signIn(); await assert.rejects(client.remove(),/not acknowledged/i);
});
