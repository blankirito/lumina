import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCapture,restoreProbeSql} from './fixture-state.mjs';
import {STAGING_URL} from './bundle.mjs';
const config={target:STAGING_URL,fixture:'lumina-recovery-10000000-0000-4000-8000-000000000001',userId:'20000000-0000-4000-8000-000000000002',storeId:'30000000-0000-4000-8000-000000000003',productId:'40000000-0000-4000-8000-000000000004'};
const fixture=()=>({fixture:config.fixture,user:{id:config.userId,email:config.fixture+'@example.invalid',encrypted_password:'synthetic-hash',email_confirmed_at:'2026-10-22T00:00:00Z',banned_until:null,raw_user_meta_data:{recovery_fixture:config.fixture}},product:{id:config.productId,store_id:config.storeId,stock:7},store:{id:config.storeId,slug:config.fixture,owner_id:config.userId},profile:{id:config.userId},members:[{user_id:config.userId,store_id:config.storeId}],identities:[{user_id:config.userId,provider:'email'}],schema:[{table:'products'}],migrations:[{version:'045'}],bucketConfig:{id:'product-images'},storageMetadata:{bucket_id:'product-images',owner_id:config.userId,name:`stores/${config.storeId}/products/${config.productId}/${config.fixture}.png`}});
test('rejects missing components and foreign records before SQL is built',()=>{
  assert.doesNotThrow(()=>validateCapture(fixture(),config));
  for(const field of ['schema','migrations','members','identities']){const f=fixture();f[field]=[];assert.throws(()=>validateCapture(f,config));}
  const f=fixture();f.members.push({user_id:'foreign',store_id:config.storeId});assert.throws(()=>validateCapture(f,config));
  f.members.pop();f.storageMetadata.owner_id='foreign';assert.throws(()=>validateCapture(f,config));
  assert.throws(()=>restoreProbeSql(fixture(),{...config,target:'https://xsjcmrlwdpudrkjhghdl.supabase.co'}));
});
test('restore SQL requires live synthetic markers and one matching row per update',()=>{
  const sql=restoreProbeSql(fixture(),config);
  assert.match(sql,/recovery_fixture/);assert.match(sql,/row_count/);assert.match(sql,/n <> 1/);assert.match(sql,/stock = 7/);assert.match(sql,/begin;/);assert.match(sql,/commit;/);
  const f=fixture();f.product.stock=-1;assert.throws(()=>restoreProbeSql(f,config));
});
