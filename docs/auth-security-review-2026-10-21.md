# Authentication security follow-up

Reviewed 21 October 2026 against PR #1's existing security branch. This report supersedes earlier statements that password recovery is missing. Keep PR #1 Draft: **GO for further controlled staging testing; NO-GO for production release.**

## Confirmation root cause

Customer and merchant registration previously requested a final page as the email redirect destination instead of `/auth/callback`. Those pages did not exchange the PKCE authorization code. Supabase could therefore confirm the email while Lumina never established its session. Both registration paths now request the exact callback URL; role and validated store routing happen after code exchange.

There was also a separate browser boundary: registration started in one browser, while the email opened in another. PKCE requires the verifier from the initiating browser. Missing/wrong-verifier staging tests fail safely, as intended. Keep the email in the same browser; do not weaken PKCE to accommodate cross-browser links. See [Supabase PKCE documentation](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

The user successfully passed Vercel Authentication and reached Preview. There is no evidence that Deployment Protection removed the code or caused the application defect. Protection remains enabled. A fresh mailed-link round trip through the updated protected Preview remains necessary before closing that integration gate.

## Repairs and safeguards

- Added public Forgot Password and server-gated Reset Password pages and connected the login link.
- Recovery requests return the same message for unknown accounts and provider failures; provider errors and email addresses are not echoed.
- The callback uses verified claims to distinguish recovery from confirmation. Editable metadata and URL hints do not authorize recovery.
- The reset page and server action independently require an authenticated user plus matching signed claims, a session ID, unexpired JWT and recovery authentication within 15 minutes. A 30-second future-clock tolerance accommodates small provider/app skew without extending the maximum age.
- The server action validates the password, updates it, then requests global sign-out. An incomplete sign-out has a distinct safe result. Existing access JWTs may remain valid until expiry; global sign-out is not a claim of instantaneous invalidation in every downstream service.
- Invalid, expired, replayed and wrong-browser links use a fixed error message and clean login destination. Callback responses and auth pages set no-store/no-referrer headers.
- Disabled Next development Server Function argument logging and callback request logging. Live testing caught the framework's default argument logger recording a disposable synthetic password; the password was replaced, sessions revoked and that local log cleared. Repeat tests found no fixture password, code or email token in the local runtime log. No real credential was used in this test.
- No provider errors, request URLs, passwords, tokens or session payloads are explicitly logged by the new application code. Infrastructure/provider access-log handling still requires operator verification; this is not an assertion about inaccessible logs.

## Verification

| Check | Result |
| --- | --- |
| Application regression suite | 289 tests / 86 files passed, including 30 new auth tests |
| ESLint | 0 errors / 33 existing warnings |
| TypeScript | Passed |
| Production build | Passed with dummy localhost settings; no deployment performed by the build |
| Production dependency audit | 0 findings |
| Full dependency audit | 5 High development-only nodes on the previously documented braces chain |
| Current source secret scan | 0 findings with redaction enabled |
| Independent auth code review | No actionable finding; hosted behavior outside reviewer scope |

Live tests used disposable synthetic identities in the explicitly authorized isolated Supabase staging project. Valid, expired, invalid and replayed signup/recovery email tokens were exercised against hosted Auth. Local application callback tests used staged PKCE flows to verify successful exchange, replay/expiry failure, missing/wrong verifiers, safe headers, and reset-form authorization. The final PKCE repeat passed 22 assertions. An earlier complete token/callback run passed 26 assertions; these overlap and are not additive scenario counts.

Six additional live reset checks passed: an ordinary signup session cannot reset; cross-origin submission is rejected; a verified recovery changes the password through the real application action; the completed recovery session cannot reset again; the new password signs in; the local log omits the password. Browser smoke verified the generic forgot-password result and the safe anonymous reset failure.

Fixtures were seeded specifically to test real Auth expiry and replay behavior; this is not proof of the full email-template and protected-Preview journey. The dedicated test inbox had already received confirmation and recovery emails on the previous build. No inbox was accessed and no production customer data was copied. Test sessions, one-time tokens and PKCE flows were removed after validation; temporary local credential files were deleted. Synthetic account/profile records remain for review.

## Redirect settings and remaining release gates

1. The branch Preview's exact `/auth/callback` entry already covers the new registration and recovery requests. `/reset-password` is an internal post-exchange destination and needs no additional Supabase redirect entry. A different Preview hostname must be explicitly allowlisted before using it for email initiation; do not add broad wildcards merely for convenience. Email-change and optional OAuth flows are outside this fix and need separate review if required for launch.
2. On the updated Preview, request a fresh recovery email, open it in the same browser after Vercel Authentication, finish the reset manually, and verify sign-in and replay rejection. Repeat fresh registration confirmation with a dedicated synthetic identity. Do not reuse previously consumed links or infer mailed-link success from seeded API fixtures. Check SMTP limits/templates and monitoring.
3. Retain prior staging payment and operational gates: approved nonpayable test payment instructions, browser subscription request/receipt behavior, concurrent checkout, abuse controls, scheduler/QR retries and outage handling.
4. Resolve or explicitly accept the documented development dependency risk; review Supabase advisor hardening items and the conditional historical IIS machine/key-reuse finding. No unrelated credential rotation is justified solely by those IIS entries.
5. Before any separately authorized production release, an operator must verify actual environment separation, Auth settings, RLS/grants/Storage, migration history, cron authentication, backups/restore and logging redaction. Production configuration has not been inspected.
6. Follow the 045 then 046 transition/recovery procedure. Stop and drain old QR writers/workers before transition, quarantine unproven legacy paths, retain hardened migrations on application rollback, and never resume an unguarded privileged cleanup worker.

No production modification, production deployment, merge, protection disablement, visibility change or license change was performed. See the [earlier dependency and IIS review](premerge-review-2026-10-21.md) and [migration recovery procedure](migration-rehearsal-2026-10-21.md).
