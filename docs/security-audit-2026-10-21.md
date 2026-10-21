# Lumina repository security audit — 21 October 2026

Scope: source and cumulative migrations from main `c708662b47ab4e91b3e3335e25c915a2ba258ec9`, npm lockfile, and all 82 available Git commits. Local tests use synthetic data only. This is a repository audit, not a statement that production is secure or that any exploit occurred.

## Findings and changes

| Priority | Evidence and impact | Repair / disposition |
| --- | --- | --- |
| P1 — framework advisories, upstream Critical | Next 16.2.10 has multiple published advisories. Server Actions are used. Windows-hosted RCE, AVIF and next/og RCE applicability depends on runtime/features; no next/og usage was found and production hosting was not inspected. | Upgrade Next and its ESLint config together to 16.4.2, refresh compatible transitive dependencies. Production npm audit has zero findings. |
| P1 — tenant data integrity | Migration 005 still granted direct order and snapshot writes after 035 revoked only order UPDATE. An owner could append a foreign-store product to an order; cancellation restored stock under a definer function. Synthetic regression changed foreign stock from 10 to 17 before the fix. | Migration 045 removes unused direct write permissions/policies, preserves protected RPC flows, and scopes inventory restoration to the order's store. |
| P1 — cross-store QR deletion | An owner could set their payment method's QR path directly, then invoke the action that deleted that stored path using service privileges. Old retry jobs carried only a path. | Validate exact canonical store/method ownership before deletion or queueing. Migration 046 constrains new references and adds retry authorization scope. Cron skips legacy/unproven jobs. |
| P2 — login redirect | Tab/newline/carriage-return characters between slashes bypassed the internal-path check; URL parsing converted it into an external URL. | Reject those characters; three regression cases prove the resulting origin stays local. |
| P2 — repository hygiene / possible local secret exposure | Gitleaks 8.30.1, with 100% redaction, found two `sessionKey` entries in committed `.vs/beauty-store/config/applicationhost.config`. These are IIS protected-configuration entries, not identified as Supabase or payment credentials. No validity or decryption was attempted. IDE caches may contain local metadata. | Remove all 22 `.vs` files from tracking and ignore the directory. Historical copies remain. Owner should review the originating development machine and regenerate affected local configuration if needed. No history rewrite or credential rotation performed. |
| P2 — development dependency residual | Five affected nodes remain on the ESLint → fast-glob → micromatch → braces chain, all from one braces stack-exhaustion advisory. Latest inspected braces release is 3.0.3; no patched upstream version is available in the audit result. | Keep the matching modern Next ESLint configuration. Do not use npm's proposed downgrade to Next 14 lint tooling. Avoid untrusted glob-pattern inputs; revisit upstream patch. This is not a production request path. |
| Follow-up — guest checkout abuse controls | The anonymous checkout action creates inventory reservations; no application rate limiter or CAPTCHA was found. | Verify deployment rate limits/WAF and agree an abuse policy in staging. Production protections were not accessible, so no claim of deployed protection or confirmed production abuse is made. |

Advisory references: [Next Windows hosting](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36), [Next AVIF processing](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4), [Next image SSRF](https://github.com/vercel/next.js/security/advisories/GHSA-cjq9-62q9-8jv4), [Vitest mocker](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9), [remaining braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

## Validation

- Original application tests: 225 passed. After repairs: 248 passed across 82 files, using Vitest 4.1.11 and Vite 7.3.7.
- Clean `npm ci --ignore-scripts --no-audit --no-fund`: passed with the normal npm client; all 248 tests passed again after installation.
- Local PostgreSQL boundary suite: 25 passed with migrations 001–046; includes both denied and legitimate flows. See `supabase/tests/README.md`.
- `npm run build`: passed, including TypeScript and static page generation, with synthetic localhost Supabase configuration. Four stale test fixtures were corrected without weakening type checks or changing application behavior.
- `npm run lint`: **not clean** — 11 errors and 36 warnings in existing UI components. Affected error files: `app/ordersuccess/page.tsx`, `app/search/page.tsx`, `components/admin/customers/CustomerForm.tsx`, `components/admin/settings/PaymentMethodEditor.tsx`, `components/cart/CartProvider.tsx`, `components/storefront/StorefrontCartPage.tsx`, `StorefrontCartProvider.tsx`, `StorefrontCheckoutPage.tsx`, `StorefrontSearchClient.tsx`, and `components/wishlist/WishlistProvider.tsx`. Mostly synchronous effect state updates, plus a nested component and unescaped text. These UI components are unchanged by this repair; rules were not disabled.
- npm audit: 23 affected packages before (3 Critical, 18 High, 2 Moderate), 5 High development-only nodes after, zero production findings. These counts are package nodes, not GitHub's reported 49 individual alerts.
- Independent read-only review found no blocking correctness issue in the repair. Full hosted integration testing is still outstanding.
- Gitleaks scan of the complete proposed source snapshot: zero findings. The two historical IIS entries remain in old commits; removal from the current tree is not credential rotation or history cleanup.

## Authorization and business logic reviewed

Server Actions, both route handlers, service-client call sites, cumulative RLS policies and security-definer routines were reviewed. Key verified boundaries: platform-admin changes are blocked by migration 027; platform subscription review and complimentary access require platform administrator authority; checkout derives customer identity from verified authentication and computes product prices in SQL; payment methods/products are scoped to the store; payment confirmation and fulfillment have database authorization/state checks; reservation cancellation/expiry is idempotent; guest tracking requires the private token; notification updates use the authenticated recipient. Manual TNG settlement still requires an administrator to verify the real transfer and avoid approving reused references; no real payments were accessed.

## Deployment review required (nothing applied)

1. Rehearse 045 and 046 against a synthetic staging database. Apply migrations before deploying the updated QR action/cron. This PR does not execute migrations.
2. Migration 046 uses `NOT VALID`: existing rows survive, but subsequent writes must satisfy the constraint. Existing invalid QR references must be removed/replaced before their payment methods can be edited normally. Review legacy cleanup jobs separately; do not infer their authority from their stored paths. They are intentionally excluded from deletion and remain stored.
3. Inspect historical order snapshots/inventory integrity only through an authorized separate process if there is concern about prior misuse. The migration does not attempt speculative data repair.
4. Verify deployed RLS/grants, applied migration history, service-role key isolation, Storage policies, Supabase redirect allowlists/email verification/re-authentication settings, cron secret/scheduling, and checkout rate limits. These production settings were **not accessed**.
5. Review the remaining development advisory and full-repository lint failures before merging; this is a draft PR. Re-run dependency scanning after merge because GitHub alerts track the default branch.

## GitHub / Dependabot status

Connected GitHub identity is `blankirito`; repository metadata reports admin and push permissions. At initial inspection and again after resuming, main was unchanged, PR search returned none, and only the main branch existed. No Dependabot update was retriggered. The connector does not expose private Dependabot/secret-scanning alerts; the available browser did not have a logged-in session. Therefore the reported 49 open alerts and internal “Creating” job status could not be independently re-read. Recheck for an overlapping Dependabot PR before merging this repair.

No merge, production deployment, production database modification, real user-data access, repository visibility change or LICENSE change was performed.
