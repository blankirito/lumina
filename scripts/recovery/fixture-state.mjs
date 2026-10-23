import {assertStagingTarget} from './bundle.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function validateCapture(c,config){
  const {target,fixture,userId,storeId,productId}=config;
  assertStagingTarget(target);
  if(![userId,storeId,productId].every(x=>uuid.test(x)) || !fixture?.startsWith('lumina-recovery-') || !uuid.test(fixture.slice(16)))throw new Error('Invalid synthetic scope');
  if(c?.fixture!==fixture || c.user?.id!==userId || c.user.email!==fixture+'@example.invalid' || c.user.raw_user_meta_data?.recovery_fixture!==fixture ||
    c.store?.id!==storeId || c.store.slug!==fixture || c.store.owner_id!==userId || c.product?.id!==productId || c.product.store_id!==storeId || c.profile?.id!==userId ||
    !Number.isSafeInteger(c.product.stock) || c.product.stock<0 || typeof c.user.encrypted_password!=='string' || !c.user.encrypted_password ||
    !Number.isFinite(Date.parse(c.user.email_confirmed_at)) || (c.user.banned_until!==null && !Number.isFinite(Date.parse(c.user.banned_until))))throw new Error('Capture is outside synthetic scope');
  for(const field of ['members','identities','schema','migrations'])if(!Array.isArray(c[field]) || !c[field].length)throw new Error('Incomplete synthetic capture');
  if(c.members.some(m=>m.user_id!==userId || m.store_id!==storeId) || c.identities.some(i=>i.user_id!==userId || i.provider!=='email'))throw new Error('Foreign related record');
  if(c.bucketConfig?.id!=='product-images' || c.storageMetadata?.bucket_id!=='product-images' || c.storageMetadata.owner_id!==userId ||
    c.storageMetadata.name!==`stores/${storeId}/products/${productId}/${fixture}.png`)throw new Error('Foreign object metadata');
  return c;
}
// Restores only the fields deliberately changed in the hosted drill. This is not
// a full database importer. Full schema/data restoration is a separate release gate.
export function restoreProbeSql(c,config){
  validateCapture(c,config);
  const q=s=>s===null?'null':"'"+String(s).replaceAll("'","''")+"'";
  const {userId,storeId,productId,fixture}=config;
  // dollar tag cannot be injected through a captured value.
  const values=[c.user.encrypted_password,c.user.email_confirmed_at,c.user.banned_until];
  if(values.some(v=>v?.includes('$recovery$') || v?.includes('\\')))throw new Error('Unsafe probe value');
  return `begin;
do $recovery$
declare n integer;
begin
  update public.products set stock = ${c.product.stock}
  where id=${q(productId)}::uuid and store_id=${q(storeId)}::uuid
    and exists(select 1 from public.stores where id=${q(storeId)}::uuid and slug=${q(fixture)} and owner_id=${q(userId)}::uuid);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Synthetic product scope mismatch'; end if;
  update auth.users set encrypted_password=${q(c.user.encrypted_password)},email_confirmed_at=${q(c.user.email_confirmed_at)}::timestamptz,banned_until=${q(c.user.banned_until)}::timestamptz
  where id=${q(userId)}::uuid and email=${q(fixture+'@example.invalid')} and raw_user_meta_data->>'recovery_fixture'=${q(fixture)};
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Synthetic Auth scope mismatch'; end if;
end;
$recovery$;
commit;`;
}
