# Synthetic recovery tooling

Run from repository root with Node 22:

```text
node --test scripts/recovery/*.node.mjs
node supabase/tests/release-hardening.mjs <path-to-installed-pglite-package>
node scripts/recovery/staging-drill.mjs <phase> <private-directory>
```

Phases: `seed-object`, `backup`, `verify-auth`, `restore-object`, `cleanup-object`. They use only the exact staging host `https://udhymvnzvsejrzpuninp.supabase.co`. No production adapter or generic backup/export mode is present.

The operator prepares a private directory outside source control containing:

- `synthetic-recovery-config.json`: target, fixture (`lumina-recovery-` + fresh UUIDv4), fresh userId/storeId/productId UUIDv4, publishable key and unique random synthetic password. No service-role key is required by this client.
- `synthetic-recovery-key.bin`: 32 cryptographically random bytes. Keep separately from the encrypted archive; the colocated drill key is not a production custody pattern. Windows file mode bits do not establish NTFS ACLs: use a private user directory/disk and explicit ACLs for any sensitive production preparation.
- `synthetic-recovery-capture.json`: fixture, user, identities, store, product, profile, members, schema, migrations, bucketConfig, storageMetadata. Select only the exact newly created IDs/fixture email/marker and exact Storage key; never scan existing users or business rows. Schema and migration catalogs are metadata only. All related captured records are validated against the fixture before archiving.

Provision ONLY a fresh synthetic confirmed Auth user (`<fixture>@example.invalid`, metadata `recovery_fixture=<fixture>`), email identity, inactive owned store (slug equals fixture) and draft/inactive product. Let application triggers create its profile/membership. These are operator fixture setup SQL actions, not public signup or customer migration. The Auth password must be hashed with the server's supported bcrypt function. No real email is sent. `seed-object` uploads a fixed pixel PNG under `stores/<storeId>/products/<productId>/<fixture>.png`.

Capture those exact rows and object metadata after upload. `backup` writes a new six-component encrypted `synthetic-recovery.lrb` and nonsecret summary, refuses overwrite and checks cryptographic integrity. The fixture is quiescent while captured: this does not implement cross-service online snapshot consistency.

For a drill, deliberately change only the synthetic product stock and synthetic password hash. `verify-auth` must fail with the archived password. Decrypt with `open` from `bundle.mjs`, reconstruct the capture from its six components, and call `restoreProbeSql` from `fixture-state.mjs`; inspect its exact IDs and execute ONLY against the staging project. It transactionally restores stock, password hash, confirmation and ban state and fails if live fixture markers/row counts mismatch. It does not recreate deleted users, arbitrary rows, schema or managed services. Then run `verify-auth` and `restore-object`. The latter requires an acknowledged exact deletion and independently observed absence before re-upload/hash verification; a failed step is not a passed drill.

After evidence capture run `cleanup-object`, confirm the exact metadata row is absent, and transactionally delete only this fixture's product/store/user after checking markers and foreign references. Remove local plaintext fixture captures/config/password and the drill-only key after retaining nonsecret verification evidence. Never publish Auth dumps, SQL carrying hashes or encryption keys. Archive recovery is no longer possible after destruction of the drill key; production retention/escrow follows the separately approved recipe.

`retentionPlan` is non-mutating: it protects object references shared by retained verified checkpoints and preserves the last verified point. No scheduling, cloud destination, production export, restore or deletion is installed by these tools. See `docs/operations/production-backup.md` for the production implementation and acceptance criteria.
