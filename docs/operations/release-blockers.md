# Lumina release blockers — execution checklist

Source: PR #1 starting at ab5ca8b, Production Release Runbook, 2026-10-22 audit and backup review. This is the single working checklist. Production: xsjcmrlwdpudrkjhghdl. Synthetic staging: udhymvnzvsejrzpuninp.

## Authorized work

- [x] Reproduce and fix missing explicit QR worker privileges, excessive TRUNCATE/default privileges and mutable updated-at search path in an additive migration. Test client denial and worker CRUD; never apply to production. Also fix the missing scoped Storage SELECT policy reproduced by the hosted image deletion drill.
- [x] Implement exact staging target guard, authenticated encrypted recovery bundles, component hashes, complete-bundle validation and retention planning. Tests: wrong target/key, tampering, incomplete bundles, expired/referenced restore points.
- [x] Validate fresh identified synthetic staging DB/Auth records and real Storage bytes, including a restore. Local SQL doubles do not certify hosted services. Actual hosted login failure/recovery and image deletion/recreation/hash check passed.
- [x] Prepare a production recipe covering full PostgreSQL/schema/roles, Auth, migration history, object versions, configuration, key custody, retention and verification. Keep production execution locked. See [implementation and acceptance recipe](production-backup.md).
- [ ] Run affected regressions, type check, lint/build and one focused final review. Publish to PR #1 with branch-specific automatic deployment suppression.

## B1–B8 closure matrix

| Gate | Action and exit | Owner/decision |
|---|---|---|
| B1 | Fresh confirmation/reset delivered-link journeys on final approved Preview in same browser, new-password login and replay rejection | Owner inbox interaction; Preview deploy approval |
| B2 | Apply reviewed hardening after baseline; configure confirmation/SMTP/redirects; verify actual key environment ownership and authorized admins; tenant tests pass | Decision 2 |
| B3 | First real backup plus restricted restore proves DB/Auth/schema, Storage bytes and configuration; measured RPO/RTO and freshness alert | Decision 1 |
| B4 | Reconcile 001–044 and hosted timestamp mapping; rehearse exact runner; apply only missing 045/046/checkout/hardening; catalog/history agree; drain old writers; retain compatible artifact | Decision 2 |
| B5 | Accept numeric launch capacity/abuse limits; effective rate limiting, alert delivery and named responder; maintenance blocks alternate old writers and QR; first scheduled jobs verified | Decision 2 |
| B6 | Owner verifies real beneficiary, settlement/duplicate references, refunds, receipts and review authority; no real transfer in this task | Decision 2 business sign-off |
| B7 | Resolve confirmed defects; disposition remaining definer grants/advisories, dev-only dependency and historical IIS reuse with named owner/date; rotate only if exposure/reuse established | Decision 2 |
| B8 | Refresh exact final commit checks once; approve source/window, staged artifact, smoke and opening traffic; all required exits signed | Decision 3 |

## Three scoped decisions — not yet authorized

1. **Backup/data custody:** select plan/add-ons and monthly ceiling; authorize named production DB/Auth export and Storage-byte copy destination/region, people, client encryption/key escrow, retention and restricted restore target. Purchasing and data access are separately specified within this decision.
2. **Production readiness:** approve exact configuration/migration diff, baseline recording, SMTP/redirects/secrets/privileges, maintenance and old-worker drain, rate limiting/alerts; assign payment/security/on-call owners. No deploy/merge included. Never replay all migrations or widen access to resolve failures.
3. **Release:** approve exact commit and Preview/staged-production deployment, owner email validation, merge only after gates, promotion/smoke/open traffic in order. Name allowed environments; automatic PR deployments stay suppressed.

## Execution rules

The user explicitly requested implementation now. Use existing reviewed requirements and this compact plan without another specification approval cycle. Continue in the existing clean PR checkout. No unrelated UI/features/refactors. Synthetic staging tests do not authorize production exports or close production B3. Do not publish backup data, credentials, synthetic passwords, tokens or raw Auth dumps. Final response lists only unmet mandatory exits and concrete closing actions.

## Implementation ledger

2026-10-22: hardening regression first failed for missing worker CRUD, TRUNCATE/default ACLs and search path; implementation passed. Hosted Storage removal returned success without deleting the fixture, catalog confirmed no applicable SELECT policy; regression failed before the scoped policy and passed after it. Applied only on staging as `20261022025242` (repo file `20261022023729`). Synthetic archive restored password and stock after deliberate mutation; Storage deletion/absence/re-upload/SHA-256 and owner metadata checks passed.

Ruling: this task's hosted recovery probe deliberately tests exact synthetic rows and one object, not a destructive full staging rebuild or production restore. A full managed restore remains an explicit B3 acceptance gate after approval; claiming this small probe establishes production RTO would be wrong.

Validation before final review: application 308/308; existing SQL boundary 25/25, migration transaction rehearsal 18/18, checkout recovery 21/21; new hardening 8/8; recovery tooling 14/14; type check and local build succeeded; lint had 0 errors and 32 existing warnings. Source changes remain on Draft PR #1; no deploy/merge is authorized.

Final review: one independent fresh-context review passed with no Critical/Important or required Minor fixes. Independently re-ran recovery 14/14 and hardening 8/8. Final ruling: production restore completeness/RPO/RTO, actual deployment suppression, production configuration/migrations and historical unresolved gates remain acceptance tasks; the patch review cannot certify those. No additional broad audit is required.

Cleanup: the exact synthetic user, store, product and object created by this drill were removed and verified absent. No customer records were accessed. Existing staging data and production state were not restored or rolled back.
