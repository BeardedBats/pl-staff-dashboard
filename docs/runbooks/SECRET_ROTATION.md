# Secret rotation

Rotate by creating a replacement, deploying and verifying it, then revoking the
old value. Never revoke the only working credential first. Vercel environment
changes affect only new deployments, so every rotation requires a new build.

## Inventory and order

| Key(s) | Kind | Rotation impact and order |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public endpoint | Change only with a project move; deploy with matching server key and verify all reads/writes before retiring the old project. |
| `SUPABASE_SERVICE_ROLE_KEY` | Critical server secret | Create a new `sb_secret_...` key, deploy/verify, then delete the old key. Prefer a dedicated key for this app over legacy `service_role`. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Critical app signing secrets | Rotate together in a maintenance window. Current code has no dual-key window; all sessions are intentionally invalidated and users must sign in again. |
| `WP_PL_USERNAME`, `WP_PL_APP_PASSWORD` | PL WordPress credential | Create a dashboard-specific application password, deploy/verify `/users/me` plus a non-destructive REST read, then revoke the old password. |
| `WP_QB_USERNAME`, `WP_QB_APP_PASSWORD` | QB WordPress credential | Same as PL; if QB is unconfigured, keep all QB fields empty rather than partial. |
| `WP_PL_URL`, `WP_QB_URL` | Public endpoints | Verify HTTPS and REST identity/capabilities before changing; deploy with the matching credentials. |
| `GA4_CLIENT_ID`, `GA4_CLIENT_SECRET` | Google OAuth client | Create/add the replacement client or secret with the exact callback, deploy, reconnect in Settings > Analytics, sync one bounded day, then retire the old credential. |
| `GA4_PROPERTY_ID` | Non-secret identifier | Verify the intended property before changing; a wrong value can write valid-looking data for the wrong property. |
| `CRON_SECRET` | Critical request secret | Update Vercel Cron authentication and application env in the same deployment window; verify one Vercel-shaped request, then invalidate the old value. |
| `NEXT_PUBLIC_APP_URL` | Public origin | Change only with domain migration; update GA4 callback allowlists and WordPress integration references before deploy. |

Provider/CLI management tokens used by operators (Supabase access token,
database password/URL, Vercel token, GitHub token) are not application env keys.
Rotate them in their provider, reauthenticate the CLI, verify minimum required
scope, and remove old native/file/plaintext copies.

## Preconditions

- Identify whether this is planned rotation or suspected compromise. Suspected
  compromise starts the incident runbook and raises severity based on scope.
- Inventory every consumer and environment (Production, Preview, Development,
  local scripts, CI, integrations) without reading values into logs.
- Record a tested recovery credential or provider owner path.
- Confirm a green deployment and current backup before rotating credentials that
  can affect database writes or authentication.

## Standard procedure

1. Create a replacement in the provider; use a distinct name identifying this
   app and environment.
2. Add it to Vercel as a **Sensitive** Production/Preview variable where
   supported. Do not pass the value on a CLI command line or commit `.env`.
3. Redeploy. Existing deployments retain their old env snapshot.
4. Verify only the affected boundary plus the standard deployment smoke gate.
5. Confirm logs contain safe codes/IDs only and no credential material.
6. Revoke/delete the old provider credential.
7. Re-test after revocation so success cannot be coming from the old value.
8. Remove old plaintext/native-store copies and record where the new credential
   is managed—not its value.

### Supabase server key

Supabase supports multiple new secret keys concurrently. Create a dedicated
secret key in Settings > API Keys, set it as `SUPABASE_SERVICE_ROLE_KEY`, deploy,
verify server reads plus one bounded disposable write/cleanup, then delete the
old secret. If the app still uses legacy `service_role`, migrate to a new secret
key rather than rotating the project JWT secret.

### Dashboard JWT pair

Generate two independent high-entropy values, update `JWT_SECRET` and
`JWT_REFRESH_SECRET`, deploy, and expect every existing cookie/session to fail.
Verify login, refresh, replay protection, and logout with a disposable account.
Remove stale rows from `sessions` only through a reviewed database operation;
do not weaken token validation to preserve old sessions.

### WordPress application password

Create a separate application password in the integration user's WordPress
profile, update the matching username/password pair, deploy, verify HTTPS REST
identity/capability and a read-only post/category/profile call, then revoke the
old application password. Never rotate or share the user's interactive login.

### GA4 OAuth client

Keep the exact production callback `${NEXT_PUBLIC_APP_URL}/api/ga4/callback`
authorized. After deploying the new client ID/secret, reconnect through the UI;
stored refresh tokens may belong to the old client and must not be copied to a
different client blindly.

## Stop conditions

- The replacement cannot coexist long enough to verify before revocation.
- A provider owner/recovery path is unavailable.
- A secret would be visible in shell history, logs, screenshots, Git, or chat.
- Vercel project/environment is ambiguous or a new deployment cannot be made.
- Verification depends on a destructive real-content operation.

## Verification

- New deployment uses the intended key names and affected integration succeeds.
- Old credential is revoked and a post-revocation check still succeeds.
- Authentication rotations exercise login, refresh, invalidation, and logout.
- Health shows recovery and the related operational alert resolves.
- Git history/status and build logs contain no secret value.

## Evidence to retain

- Provider, key name/type, opaque provider credential ID or last safe prefix,
  environments, creator/revoker, and UTC times.
- Deployment ID/commit, boundary tests, post-revocation result, and session/user
  impact. Never retain the secret value.
- Plaintext/native credential locations removed and any residual owner/date.

References: [Vercel rotating secrets](https://vercel.com/docs/environment-variables/rotating-secrets),
[Vercel sensitive variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables),
[Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys),
and [WordPress Application Passwords](https://developer.wordpress.org/advanced-administration/security/application-passwords/).
