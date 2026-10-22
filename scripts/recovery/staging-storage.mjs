import { randomUUID } from 'node:crypto';
import { assertStagingTarget } from './bundle.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function createStagingStorageClient(config, transport=fetch) {
  const {target,fixture,userId,storeId,productId,key,password}=config;
  assertStagingTarget(target);
  if (![userId,storeId,productId].every(x=>uuid.test(x)) ||
      !fixture?.startsWith('lumina-recovery-') || !uuid.test(fixture.slice(16)) ||
      typeof key!=='string' || !key || typeof password!=='string' || !password)
    throw new Error('Invalid synthetic fixture scope');
  const email=fixture+'@example.invalid';
  const objectKey='stores/'+storeId+'/products/'+productId+'/'+fixture+'.png';
  const objectPath='/storage/v1/object/product-images/'+objectKey;
  let token;
  async function request(path,options={}) {
    try {
      return await transport(target+path,{...options,redirect:'error',cache:'no-store',
        signal:AbortSignal.timeout(30000),
        headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{}),...options.headers}});
    } catch { throw new Error('Staging request unavailable'); }
  }
  const requireSession=()=>{if(!token)throw new Error('Sign in to the synthetic fixture first');};
  async function checked(path,options) {
    const result=await request(path,options);
    if(!result.ok)throw new Error('Staging Storage request failed ('+result.status+')');
    return result;
  }
  return {
    objectKey,
    async signIn() {
      token=undefined;
      const result=await request('/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
      if(!result.ok)throw new Error('Synthetic Auth sign-in failed ('+result.status+')');
      const body=await result.json();
      if(body.user?.id!==userId || body.user?.email!==email || typeof body.access_token!=='string')
        throw new Error('Synthetic Auth identity mismatch');
      token=body.access_token;
    },
    async upload(bytes) {
      requireSession();
      if(!Buffer.isBuffer(bytes) || !bytes.length || bytes.length>5*1024*1024)throw new Error('Invalid fixture object size');
      await checked(objectPath,{method:'POST',headers:{'Content-Type':'image/png','x-upsert':'false','cache-control':'0'},body:bytes});
    },
    async download() {
      requireSession();
      const result=await checked('/storage/v1/object/public/product-images/'+objectKey+'?recoveryCheck='+randomUUID(),{method:'GET'});
      if(Number(result.headers.get('content-length'))>5*1024*1024)throw new Error('Fixture object size exceeds limit');
      const chunks=[]; let size=0;
      for await (const chunk of result.body) {
        size+=chunk.length; if(size>5*1024*1024)throw new Error('Fixture object size exceeds limit');
        chunks.push(chunk);
      }
      if(!size)throw new Error('Empty fixture object');
      return Buffer.concat(chunks);
    },
    async remove() {
      requireSession();
      const response=await checked('/storage/v1/object/product-images',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[objectKey]})});
      const deleted=await response.json();
      if(!Array.isArray(deleted) || deleted.length!==1 || deleted[0].name!==objectKey)throw new Error('Synthetic object deletion not acknowledged');
    },
    async signOut() {
      if(!token)return;
      try { await checked('/auth/v1/logout?scope=local',{method:'POST'}); }
      finally { token=undefined; }
    }
  };
}
