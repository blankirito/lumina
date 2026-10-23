# PR #1 second-round pre-merge review

Review date: 21 October 2026. Initial reviewed head: `df7aafd666b9454d1ac735e6e7dd35f210f337c8`. All local fixtures are synthetic. No hosted database, production environment or real customer/payment data was accessed.

## Development dependency disposition

The refreshed npm registry audit still reports five High package nodes from one advisory, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The advisory lists no patched version. Registry latest versions checked on the review date: braces 3.0.3, micromatch 4.0.8, eslint-config-next 16.4.2.

| Installed node | Why reported | Disposition |
| --- | --- | --- |
| eslint-config-next 16.4.2 | Direct development dependency, inherits affected plugin | Retain matching Next 16 tooling |
| @next/eslint-plugin-next 16.4.2 | Depends on fast-glob | No safe upstream replacement available in matching release |
| fast-glob 3.3.1 | Depends on micromatch | An isolated fast-glob update would still retain the affected braces chain |
| micromatch 4.0.8 | Depends on braces | Latest inspected version still affected transitively |
| braces 3.0.3 | Deeply nested glob-pattern stack exhaustion | No published patch; retain as explicitly documented residual risk |

Installed `@next/eslint-plugin-next/dist/utils/get-root-dirs.js` calls fast-glob for the developer-controlled `settings.next.rootDir` option. This repository does not set that option; the normal path uses `context.cwd`. There is no application import of these development packages. This review found no customer-input path into these glob patterns. The impact is development/CI availability if untrusted patterns are introduced, rather than a demonstrated production request vulnerability.

Do not apply npm's proposed eslint-config-next 14.2.35 major downgrade: it replaces the Next 16 lint integration and does not patch braces. Do not remove lint rules, conceal audit results, or introduce an unaudited package fork solely to make the count zero. Review future lint configuration changes, keep untrusted builds away from credentials, and recheck upstream before release and when the lockfile changes. The repository owner must explicitly accept this residual development risk if proceeding while upstream remains unpatched; no audit suppression was added.

## Historical IIS findings and rotation recommendation

Two redacted Gitleaks findings occur in the historical `.vs/beauty-store/config/applicationhost.config` at commit `14fd5ec366cc7d269ee0e7c0c4595f6e50ca5524`. Metadata identifies `Microsoft.ApplicationHost.AesProtectedConfigurationProvider`, providers `AesProvider` / `IISWASOnlyAesProvider`, and machine containers `iisConfigurationKey` / `iisWasKey`. The historical XML has zero nonempty password/userName attributes. A filename inventory of that commit found no obvious machine-key export, PEM, PFX, P12 or KEY file. This is a scoped check, not proof that private keys were never exposed elsewhere. Values were neither displayed, decoded nor tested.

Microsoft documents these as [machine-specific IIS protected-configuration key containers](https://learn.microsoft.com/en-us/iis/manage/managing-your-configuration-settings/shared-configuration_264), with separate private-key export/import required to share encrypted configuration across machines. [IIS password protection](https://learn.microsoft.com/en-us/iis/manage/configuring-security/using-encryption-to-protect-passwords) also relies on configured key providers. The provider metadata supports classifying these findings as IIS configuration encryption material, not evidence of a Lumina authentication token or Supabase/payment credential leak.

Recommendation: **no blanket Supabase, payment, GitHub or Vercel credential rotation is justified by these two entries alone**. The originating machine owner should confirm that this is disposable IIS Express development configuration and that its private key containers/exported backups were not exposed or reused on another host. If disposable, regenerate the local IDE/IIS Express configuration through normal tooling. If corresponding private keys were exposed, or protected real service credentials were stored/reused there, rotate those affected credentials and re-provision/re-encrypt the affected IIS configuration under new protected keys with the machine administrator. Do not delete machine key containers blindly: other IIS applications may depend on them. Production reuse and machine compromise remain unverified; no credential rotation or history rewrite was performed. Removing `.vs` from this PR does not remove old Git objects or invalidate credentials.

## Preview and Dependabot evidence

GitHub reports the initial reviewed head's Vercel deployment completed successfully and the Preview Comments check succeeded. Deployment: [Vercel build](https://vercel.com/chongyus-projects/beauty-store/FAq979aCZF3V9HoPhJ5Fk889EiMM). The Preview URL redirects to Vercel authentication. The Vercel connector returned HTTP 403 for the `chongyus-projects` team; no local Vercel CLI is available. Build logs, runtime behavior and Preview database isolation could not be verified through the available access.

The owner will handle Vercel team authorization separately and explicitly instructed us not to bypass the 403 or write through Preview until its Supabase environment is confirmed isolated. Therefore no hosted checkout, inventory, subscription, QR upload/deletion or payment workflow was attempted. Successful deployment status is not evidence that these flows work or that migrations have been applied.

GitHub PR search during this round returned only PR #1, with no overlapping Dependabot PR. Private alert counts and the original internal “Creating” job state remain inaccessible; no update was retriggered. Recheck overlap immediately before merge.

## Verification and merge recommendation

All 11 ESLint errors are fixed without disabling rules. Cart/wishlist/search initialization now uses stable external-store snapshots for SSR and hydration; cart/wishlist persistence remains in an effect. Product loading is derived from request identity, with stale completion guards. QR preview URLs are created on input and revoked during cleanup; icons use stable component branches. Text escaping preserves displayed copy. Independent review caught and corrected a storage-error regression before publication: persistence must not throw inside the successful checkout's cart-clearing handler. The new regression covers multiple cart removals and recording success before a failed persistence write.

| Final check | Result |
| --- | --- |
| Application tests | **259 passed, 83 files** |
| ESLint | **0 errors, 33 warnings**, exit 0; no rule disabled |
| TypeScript `tsc --noEmit` | Passed, exit 0 |
| Production `npm run build` | Passed; Next 16.4.2, 42 static pages, synthetic localhost settings |
| Order/tenant database boundary suite | **25 passed** |
| Migration failure/rollback/recovery suite | **18 passed** |
| npm audit, full dependency graph | **5 High development-only nodes**, exit 1; documented above |
| npm audit, production dependencies | **0 findings**, exit 0 |
| Gitleaks current tracked/proposed source snapshot | **0 findings** with full redaction |
| Independent second-round code review | No remaining concrete code defect after storage-error fix |

The first local build attempts hit a Turbopack worker startup failure while processing CSS. Retrying with a clean generated `.next` directory passed; the previous generated cache was preserved outside the repository. No application configuration or lint rule was changed to obtain that result. Test temporary files were directed to the writable local work directory.

Local browser smoke ran the final production build on loopback with dummy localhost Supabase settings. Using the repository's static sample catalog, it verified search results, search history after reload, history reuse/clear, wishlist add/remove and reload persistence, product quantity selection, cart add/decrement and reload persistence, and required-field login validation. Browser error/warning log query returned no entries. No order or authentication request was submitted. These checks exercise client hydration and persistence; they do not establish authenticated hosted merchant/store flows, live per-store switching, stale-request races or browser QR upload/revocation behavior. Store-key isolation and asynchronous authorization boundaries additionally have unit/SQL coverage, with the integration gaps retained below.

Migrations 045/046 received an independent callsite review and a fresh local embedded-PostgreSQL rehearsal. [The recovery report](migration-rehearsal-2026-10-21.md) records atomic rollback, partial-046 forward completion, preserved legacy data, constraints, and the safe app rollback strategy. This is synthetic local staging, **not hosted Supabase staging**. Migration SQL itself is unchanged.

**Recommendation: NO-GO for merge/release at this point. Local code checks are green, but required hosted integration and operational evidence is missing. Keep PR #1 a draft.**

Remaining gates:

1. Authorize Vercel team inspection separately and confirm Preview uses an isolated Supabase project containing synthetic data only. Then review the final commit's build/runtime logs and exercise login/roles, two-store cart/search navigation, checkout/order tracking, manual payment/fulfillment, subscriptions and QR upload/remove/retry. Verify denial paths with a second tenant. No such Preview writes have been performed.
2. Rehearse with the actual hosted Supabase migration runner, ledger and transaction behavior. Verify Auth/PostgREST, Storage, schema cache, scheduling, concurrency and a compatible rollback artifact. Embedded SQL does not replace this evidence.
3. Own the coordinated transition: block old QR mutations and old cleanup workers, drain them, apply 045 then 046, verify effective permissions/constraints, then enable only hardened app/worker code. Keep 045/046 on app rollback; never roll back to an active unguarded QR worker. Invalid existing QR references require explicit reviewed removal/replacement; unproven legacy jobs stay quarantined.
4. Before any later authorized production release, an operator must verify applied migration history and actual RLS/grants/Storage policies; service-key isolation; auth redirect/email/re-auth settings; cron authentication; guest-checkout abuse controls; manual payment reference/settlement procedures; backup/recovery readiness and monitoring. Production configuration was not inspected. Any production data inspection requires a separately authorized process.
5. Accept or resolve the documented development-only advisory risk and complete the originating IIS machine review. Recheck for Dependabot overlap immediately before merge. The current evidence alone does not warrant unrelated production credential rotation.

No merge, production deployment, production database change, Preview database write, repository visibility change, LICENSE change or credential rotation was performed.
