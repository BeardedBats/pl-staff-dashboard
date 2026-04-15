-- =====================================================================
-- PL Staff Content Dashboard - Initial Schema
-- Migration: 0001_initial_schema.sql
-- =====================================================================
-- Creates all 29 tables in dependency-safe order, plus performance
-- indexes and an updated_at trigger function applied to every table
-- that carries an updated_at column.
--
-- Note: Row Level Security is intentionally NOT enabled. Authorization
-- is enforced in Next.js route handlers using the service_role key.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- Shared trigger function: set updated_at = now() on row update
-- =====================================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- Table 1: users
-- =====================================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wp_user_id INTEGER NOT NULL,
  wp_site TEXT NOT NULL CHECK (wp_site IN ('pl', 'qb', 'both')),
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  discord_id TEXT,
  twitter_handle TEXT,
  bluesky_handle TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
  auto_approve_drafts BOOLEAN NOT NULL DEFAULT false,
  can_publish BOOLEAN NOT NULL DEFAULT false,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  last_wp_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- Table 2: user_roles
-- =====================================================================
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('writer', 'editor', 'graphics', 'manager', 'admin', 'eic', 'operations')),
  site TEXT NOT NULL CHECK (site IN ('pl', 'qb', 'both')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role, site)
);

-- =====================================================================
-- Table 3: teams
-- =====================================================================
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  manager_id UUID NOT NULL REFERENCES users(id),
  site TEXT NOT NULL CHECK (site IN ('pl', 'qb', 'both')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_teams_updated_at BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- Table 4: team_members
-- =====================================================================
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- =====================================================================
-- Table 5: sessions
-- =====================================================================
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- Table 6: tiers
-- =====================================================================
CREATE TABLE tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- Table 7: categories
-- =====================================================================
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site TEXT NOT NULL CHECK (site IN ('pl', 'qb')),
  wp_category_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- Table 8: season_modes
-- =====================================================================
CREATE TABLE season_modes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  auto_switch_start DATE,
  auto_switch_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- Table 18 (moved earlier): checklist_items
-- Must be created before recurring_template_checklist and entry_checklist.
-- =====================================================================
CREATE TABLE checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id UUID NOT NULL REFERENCES tiers(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- Table 9: recurring_templates
-- =====================================================================
CREATE TABLE recurring_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_pattern TEXT NOT NULL,
  site TEXT NOT NULL CHECK (site IN ('pl', 'qb')),
  tier_id UUID NOT NULL REFERENCES tiers(id),
  category_id UUID REFERENCES categories(id),
  default_publish_time TIME,
  assigned_user_id UUID REFERENCES users(id),
  description_template TEXT,
  season_mode_id UUID NOT NULL REFERENCES season_modes(id),
  schedule_rule JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_recurring_templates_updated_at BEFORE UPDATE ON recurring_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- Table 10: recurring_template_roles
-- =====================================================================
CREATE TABLE recurring_template_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES recurring_templates(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('writer', 'editor', 'graphics')),
  UNIQUE(template_id, role)
);

-- =====================================================================
-- Table 11: recurring_template_checklist
-- =====================================================================
CREATE TABLE recurring_template_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES recurring_templates(id) ON DELETE CASCADE,
  checklist_item_id UUID NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  UNIQUE(template_id, checklist_item_id)
);

-- =====================================================================
-- Table 12: entries
-- =====================================================================
CREATE TABLE entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  site TEXT NOT NULL CHECK (site IN ('pl', 'qb')),
  tier_id UUID NOT NULL REFERENCES tiers(id),
  priority BOOLEAN NOT NULL DEFAULT false,
  publish_date TIMESTAMPTZ,
  publish_date_precision TEXT NOT NULL DEFAULT 'none' CHECK (publish_date_precision IN ('exact', 'loose_date', 'loose_time', 'none')),
  category_id UUID REFERENCES categories(id),
  series_id UUID REFERENCES recurring_templates(id),
  wp_post_id INTEGER,
  wp_post_url TEXT,
  content_status TEXT NOT NULL DEFAULT 'writer_needed' CHECK (content_status IN ('writer_needed', 'claim_requested', 'claimed', 'submitted', 'polishing')),
  editor_status TEXT NOT NULL DEFAULT 'none' CHECK (editor_status IN ('none', 'ready_for_edit', 'edited', 'scheduled')),
  is_archived BOOLEAN NOT NULL DEFAULT false,
  archive_reason TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  word_count INTEGER DEFAULT 0,
  recent_activity JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_entries_updated_at BEFORE UPDATE ON entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- Table 13: entry_authors
-- =====================================================================
CREATE TABLE entry_authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'primary' CHECK (role IN ('primary', 'co_author')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entry_id, user_id)
);

-- =====================================================================
-- Table 14: entry_editors
-- =====================================================================
CREATE TABLE entry_editors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entry_id, user_id)
);

-- =====================================================================
-- Table 15: graphic_requests
-- =====================================================================
CREATE TABLE graphic_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  urgency_date TIMESTAMPTZ,
  graphic_status TEXT NOT NULL DEFAULT 'needed' CHECK (graphic_status IN ('needed', 'claimed', 'submitted', 'flagged')),
  claimed_by UUID REFERENCES users(id),
  file_url TEXT,
  flag_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_graphic_requests_updated_at BEFORE UPDATE ON graphic_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- Table 16: claims
-- =====================================================================
CREATE TABLE claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  role_type TEXT NOT NULL CHECK (role_type IN ('writer', 'editor', 'graphic')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- =====================================================================
-- Table 17: archive_requests
-- =====================================================================
CREATE TABLE archive_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  resolved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- =====================================================================
-- Table 19: entry_checklist
-- =====================================================================
CREATE TABLE entry_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  checklist_item_id UUID NOT NULL REFERENCES checklist_items(id),
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_by UUID REFERENCES users(id),
  completed_at TIMESTAMPTZ,
  UNIQUE(entry_id, checklist_item_id)
);

-- =====================================================================
-- Table 20: comments
-- =====================================================================
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  parent_id UUID REFERENCES comments(id),
  mentions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_comments_updated_at BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- Table 21: audit_log
-- =====================================================================
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('status_change', 'field_edit', 'claim', 'comment', 'archive', 'graphic_update', 'checklist', 'assignment', 'created', 'scheduled')),
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- Table 22: notifications
-- =====================================================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES entries(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('new_claimable', 'claim_requested', 'claim_resolved', 'content_submitted', 'sent_to_polishing', 'graphic_requested', 'graphic_submitted', 'graphic_flagged', 'deadline_approaching', 'entry_scheduled', 'entry_published', 'mention', 'archive_requested', 'unclaimed_slot', 'priority_flagged')),
  title TEXT NOT NULL,
  body TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  discord_sent BOOLEAN NOT NULL DEFAULT false,
  email_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;

-- =====================================================================
-- Table 23: notification_preferences
-- =====================================================================
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  discord_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  in_app_enabled BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(user_id, event_type)
);

-- =====================================================================
-- Table 24: global_settings
-- =====================================================================
CREATE TABLE global_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_global_settings_updated_at BEFORE UPDATE ON global_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- Table 25: file_attachments
-- =====================================================================
CREATE TABLE file_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- Table 26: article_analytics
-- =====================================================================
CREATE TABLE article_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  pageviews INTEGER NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0,
  avg_time_on_page REAL DEFAULT 0,
  new_users INTEGER NOT NULL DEFAULT 0,
  returning_users INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entry_id, date)
);

-- =====================================================================
-- Table 27: raptive_revenue
-- =====================================================================
CREATE TABLE raptive_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES entries(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  page_url TEXT NOT NULL,
  earnings DECIMAL(10,4) NOT NULL DEFAULT 0,
  rpm DECIMAL(10,4) NOT NULL DEFAULT 0,
  page_rpm DECIMAL(10,4) NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0,
  pageviews INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- Table 28: raptive_uploads
-- =====================================================================
CREATE TABLE raptive_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by UUID NOT NULL REFERENCES users(id),
  file_name TEXT NOT NULL,
  date_range_start DATE NOT NULL,
  date_range_end DATE NOT NULL,
  rows_imported INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- Table 29: saved_table_views
-- =====================================================================
CREATE TABLE saved_table_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters JSONB DEFAULT '{}'::jsonb,
  sort JSONB DEFAULT '{}'::jsonb,
  columns JSONB DEFAULT '[]'::jsonb,
  grouping TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- Performance indexes
-- =====================================================================

-- Hot filters on the entries table (active content only)
CREATE INDEX idx_entries_site_tier ON entries(site, tier_id) WHERE is_archived = false;
CREATE INDEX idx_entries_publish_date ON entries(publish_date) WHERE is_archived = false;
CREATE INDEX idx_entries_content_status ON entries(content_status) WHERE is_archived = false;
CREATE INDEX idx_entries_editor_status ON entries(editor_status) WHERE is_archived = false;
CREATE INDEX idx_entries_series ON entries(series_id) WHERE series_id IS NOT NULL;

-- Children of entries (most-common join paths)
CREATE INDEX idx_entry_authors_user ON entry_authors(user_id);
CREATE INDEX idx_graphic_requests_status ON graphic_requests(graphic_status);
CREATE INDEX idx_claims_pending ON claims(status) WHERE status = 'pending';
CREATE INDEX idx_comments_entry ON comments(entry_id, created_at);
CREATE INDEX idx_audit_log_entry ON audit_log(entry_id, created_at DESC);

-- Auth / user lookups
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_users_wp ON users(wp_user_id, wp_site);
