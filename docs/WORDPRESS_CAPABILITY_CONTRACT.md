# WordPress capability contract

Verified read-only against Pitcher List WordPress on 2026-07-22. No post,
media, taxonomy, user, or metadata value was changed during verification.

## Verified surface

- Application-password authentication succeeds at `/wp/v2/users/me` with the
  dedicated integration account. The account currently reports the
  `administrator` role.
- Core REST edit-context reads succeed for posts, pages, attachments, users,
  categories, tags, and post statuses.
- Supported statuses include `draft`, `pending`, `future`, `publish`,
  `private`, and `trash`; the dashboard synchronization contract intentionally
  processes only the statuses used by its editorial workflow.
- Post edit-context responses expose author, status, permalink, modified time,
  content, taxonomy IDs, featured media, and revision-relevant fields.
- Yoast is installed (`yoast/v1`). Core post responses expose read-only
  rendered `yoast_head` and `yoast_head_json` values. The authenticated core
  post `meta` schema separately registers exactly three writable strings used
  by this dashboard: `_yoast_wpseo_focuskw`, `_yoast_wpseo_title`, and
  `_yoast_wpseo_metadesc`. No other Yoast write is supported. These fields are
  sent only through a manager-approved, revision-checked core post update with
  a recorded before/after audit.

QB List is not configured in the current application environment. All QB
capability-dependent behavior must remain disabled or clearly unavailable
rather than borrowing Pitcher List credentials.

## Synchronization contract

Scheduled five-minute reconciliation remains authoritative and is the recovery
backstop. An optional inbound webhook reduces latency when configured:

1. WordPress sends only `site`, positive `post_id`, and a stable `event_id`.
2. `X-PL-Signature` is an HMAC-SHA256 over the exact raw JSON body using
   `WP_WEBHOOK_SECRET` (minimum 32 characters).
3. The dashboard stores one server-only attempt row per site/event ID, allows
   at most three attempts, and deduplicates completed or concurrent delivery.
4. The signed payload never supplies trusted content. It triggers an
   authenticated WordPress edit-context read and the normal reconciliation
   path.
5. When the secret is absent, the webhook returns unavailable while scheduled
   reconciliation continues normally.

Never place the WordPress application password or webhook secret in browser
code, webhook bodies, logs, operational metadata, or client-readable tables.
