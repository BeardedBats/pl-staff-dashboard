# WordPress capability contract

Verified read-only against Pitcher List WordPress on 2026-07-22. No post,
media, taxonomy, user, or metadata value was changed during verification.

## Product boundary

WordPress is the source of truth for article content, publication metadata,
status, and Yoast values. The dashboard reads those fields; it is not an
article editor, revision merger, or two-way content synchronization system.
The only WordPress writes retained are the existing narrow draft-creation and
graphics-submission workflows.

## Verified read surface

- Application-password authentication succeeds at `/wp/v2/users/me` with the
  dedicated integration account.
- Authenticated edit-context reads expose posts, pages, attachments, users,
  categories, tags, statuses, author, permalink, modified time, slug, excerpt,
  content, taxonomy IDs, featured media, and scheduling fields.
- Yoast is installed and core post responses expose rendered `yoast_head` and
  `yoast_head_json` values. The dashboard treats all Yoast values as read-only
  and offers copy/instructions instead of write-back.
- QB List is unconfigured. QB-dependent behavior remains unavailable and never
  borrows Pitcher List credentials.

## Reconciliation contract

Authenticated five-minute polling is the primary recovery mechanism. Manual
refresh uses the same WordPress read path for authorized entry viewers.

1. The poll uses a retained watermark, paginates every changed row, and advances
   the watermark only when the complete run succeeds.
2. Matching is idempotent on site plus WordPress post ID.
3. WordPress-owned status, permalink, and modified time replace cached values
   on refresh. Dashboard-owned workflow fields are not merged into article
   content.
4. Last successful sync, stale state, and a bounded sanitized error remain
   visible. Failed rows stay inside the next retry window.
5. Public/preview links use the WordPress permalink; the authenticated edit
   link is derived from the configured site and post ID.

There is no deployed inbound WordPress webhook, event ledger, generalized
content-conflict state, body editor, or Yoast/content write-back. Never place a
WordPress application password in browser code, logs, operational metadata, or
client-readable tables.
