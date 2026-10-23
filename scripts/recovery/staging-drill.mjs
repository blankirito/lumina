// Operator-only synthetic drill. No production host accepted; never logs credentials/data.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateCapture} from './fixture-state.mjs';
import {seal,open,sha256,assertStagingTarget} from './bundle.mjs';
import {createStagingStorageClient} from './staging-storage.mjs';

export async function runDrill(phase,directory) {
  if(!['seed-object','backup','restore-object','verify-auth','cleanup-object'].includes(phase))throw new Error('Unknown drill phase');
  const dir=resolve(directory);
  const config=JSON.parse(await readFile(resolve(dir,'synthetic-recovery-config.json'),'utf8'));
  assertStagingTarget(config.target);
  const client=createStagingStorageClient(config);
  let signedIn=false;
  try {
    await client.signIn(); signedIn=true;
    if(phase==='seed-object') {
      // A fixed 1-pixel PNG fixture: never a payment QR.
      const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
      await client.upload(bytes);
      if(sha256(await client.download())!==sha256(bytes))throw new Error('Initial object mismatch');
    } else if(phase==='backup') {
      const key=await readFile(resolve(dir,'synthetic-recovery-key.bin'));
      const capture=JSON.parse(await readFile(resolve(dir,'synthetic-recovery-capture.json'),'utf8'));
      validateCapture(capture,config);
      const bytes=await client.download();
      const components={
        database:Buffer.from(JSON.stringify({product:capture.product,store:capture.store,profile:capture.profile,members:capture.members})),
        auth:Buffer.from(JSON.stringify({user:capture.user,identities:capture.identities,sessionPolicy:'force-reauthentication'})),
        schema:Buffer.from(JSON.stringify(capture.schema)),
        storage:Buffer.from(JSON.stringify({bucket:'product-images',objectKey:client.objectKey,metadata:capture.storageMetadata,bytes:bytes.toString('base64'),hash:sha256(bytes)})),
        config:Buffer.from(JSON.stringify({target:config.target,fixture:config.fixture,scope:'synthetic-fixture',bucketConfig:capture.bucketConfig})),
        migrations:Buffer.from(JSON.stringify(capture.migrations))
      };
      const encrypted=seal({target:config.target,fixture:config.fixture,createdAt:new Date().toISOString(),components},key);
      const verified=open(encrypted,key,config);
      if(sha256(verified.components.storage)!==sha256(components.storage))throw new Error('Archive verification failed');
      await writeFile(resolve(dir,'synthetic-recovery.lrb'),encrypted,{flag:'wx',mode:0o600});
      await writeFile(resolve(dir,'synthetic-recovery-summary.json'),JSON.stringify({fixture:config.fixture,scope:'synthetic-only',components:6,archiveHash:sha256(encrypted),objectHash:sha256(bytes),backupVerified:true}),{flag:'wx',mode:0o600});
    } else if(phase==='restore-object') {
      const key=await readFile(resolve(dir,'synthetic-recovery-key.bin'));
      const restored=open(await readFile(resolve(dir,'synthetic-recovery.lrb')),key,config);
      const storage=JSON.parse(restored.components.storage);
      if(storage.objectKey!==client.objectKey || storage.bucket!=='product-images')throw new Error('Object scope mismatch');
      const bytes=Buffer.from(storage.bytes,'base64');
      if(sha256(bytes)!==storage.hash)throw new Error('Object hash mismatch');
      await client.remove();
      let missing=false;
      try {await client.download();}catch(error){missing=/\((400|404)\)/.test(error.message);}
      if(!missing)throw new Error('Object deletion not independently observed');
      await client.upload(bytes);
      if(sha256(await client.download())!==storage.hash)throw new Error('Restored object hash mismatch');
    } else if(phase==='cleanup-object') await client.remove();
    return {phase,passed:true,scope:'synthetic-only'};
  } finally {if(signedIn)await client.signOut();}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await runDrill(process.argv[2],process.argv[3]))); }
  catch(error) { console.error('Recovery drill failed: '+error.message);process.exitCode=1; }
}
