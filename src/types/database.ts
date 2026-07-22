export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      archive_requests: {
        Row: {
          created_at: string
          entry_id: string
          id: string
          reason: string
          requested_by: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          entry_id: string
          id?: string
          reason: string
          requested_by: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          entry_id?: string
          id?: string
          reason?: string
          requested_by?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "archive_requests_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archive_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archive_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      article_analytics: {
        Row: {
          avg_time_on_page: number | null
          date: string
          entry_id: string
          id: string
          new_users: number
          pageviews: number
          returning_users: number
          sessions: number
          synced_at: string
        }
        Insert: {
          avg_time_on_page?: number | null
          date: string
          entry_id: string
          id?: string
          new_users?: number
          pageviews?: number
          returning_users?: number
          sessions?: number
          synced_at?: string
        }
        Update: {
          avg_time_on_page?: number | null
          date?: string
          entry_id?: string
          id?: string
          new_users?: number
          pageviews?: number
          returning_users?: number
          sessions?: number
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_analytics_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          entry_id: string
          field_name: string | null
          id: string
          new_value: string | null
          old_value: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entry_id: string
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entry_id?: string
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          id: string
          is_active: boolean
          name: string
          site: string
          synced_at: string
          wp_category_id: number
        }
        Insert: {
          id?: string
          is_active?: boolean
          name: string
          site: string
          synced_at?: string
          wp_category_id: number
        }
        Update: {
          id?: string
          is_active?: boolean
          name?: string
          site?: string
          synced_at?: string
          wp_category_id?: number
        }
        Relationships: []
      }
      checklist_items: {
        Row: {
          created_at: string
          id: string
          is_required: boolean
          label: string
          sort_order: number
          tier_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_required?: boolean
          label: string
          sort_order?: number
          tier_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_required?: boolean
          label?: string
          sort_order?: number
          tier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      claims: {
        Row: {
          approved_by: string | null
          created_at: string
          entry_id: string
          id: string
          resolved_at: string | null
          role_type: string
          status: string
          user_id: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          entry_id: string
          id?: string
          resolved_at?: string | null
          role_type: string
          status?: string
          user_id: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          entry_id?: string
          id?: string
          resolved_at?: string | null
          role_type?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claims_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string
          entry_id: string
          id: string
          mentions: Json | null
          parent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          entry_id: string
          id?: string
          mentions?: Json | null
          parent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          entry_id?: string
          id?: string
          mentions?: Json | null
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_entry_fkey"
            columns: ["parent_id", "entry_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id", "entry_id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_runs: {
        Row: {
          attempt: number
          error_code: string | null
          finished_at: string | null
          id: string
          job_name: string
          lease_expires_at: string
          run_key: string
          source: string
          started_at: string
          status: string
          summary: Json | null
        }
        Insert: {
          attempt?: number
          error_code?: string | null
          finished_at?: string | null
          id?: string
          job_name: string
          lease_expires_at: string
          run_key: string
          source: string
          started_at?: string
          status: string
          summary?: Json | null
        }
        Update: {
          attempt?: number
          error_code?: string | null
          finished_at?: string | null
          id?: string
          job_name?: string
          lease_expires_at?: string
          run_key?: string
          source?: string
          started_at?: string
          status?: string
          summary?: Json | null
        }
        Relationships: []
      }
      entries: {
        Row: {
          archive_reason: string | null
          category_id: string | null
          content_status: string
          created_at: string
          created_by: string
          description: string | null
          editor_status: string
          id: string
          is_archived: boolean
          is_drafted: boolean
          is_historical: boolean
          priority: boolean
          publish_date: string | null
          publish_date_precision: string
          published_at: string | null
          recent_activity: Json | null
          series_id: string | null
          site: string
          tier_id: string
          title: string
          updated_at: string
          word_count: number | null
          wp_modified_at: string | null
          wp_post_id: number | null
          wp_post_url: string | null
          wp_status: string | null
        }
        Insert: {
          archive_reason?: string | null
          category_id?: string | null
          content_status?: string
          created_at?: string
          created_by: string
          description?: string | null
          editor_status?: string
          id?: string
          is_archived?: boolean
          is_drafted?: boolean
          is_historical?: boolean
          priority?: boolean
          publish_date?: string | null
          publish_date_precision?: string
          published_at?: string | null
          recent_activity?: Json | null
          series_id?: string | null
          site: string
          tier_id: string
          title: string
          updated_at?: string
          word_count?: number | null
          wp_modified_at?: string | null
          wp_post_id?: number | null
          wp_post_url?: string | null
          wp_status?: string | null
        }
        Update: {
          archive_reason?: string | null
          category_id?: string | null
          content_status?: string
          created_at?: string
          created_by?: string
          description?: string | null
          editor_status?: string
          id?: string
          is_archived?: boolean
          is_drafted?: boolean
          is_historical?: boolean
          priority?: boolean
          publish_date?: string | null
          publish_date_precision?: string
          published_at?: string | null
          recent_activity?: Json | null
          series_id?: string | null
          site?: string
          tier_id?: string
          title?: string
          updated_at?: string
          word_count?: number | null
          wp_modified_at?: string | null
          wp_post_id?: number | null
          wp_post_url?: string | null
          wp_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_category_site_fkey"
            columns: ["category_id", "site"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "site"]
          },
          {
            foreignKeyName: "entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "recurring_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_series_site_fkey"
            columns: ["series_id", "site"]
            isOneToOne: false
            referencedRelation: "recurring_templates"
            referencedColumns: ["id", "site"]
          },
          {
            foreignKeyName: "entries_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_authors: {
        Row: {
          assigned_at: string
          entry_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          entry_id: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          entry_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_authors_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_authors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_checklist: {
        Row: {
          checklist_item_id: string
          completed_at: string | null
          completed_by: string | null
          entry_id: string
          id: string
          is_completed: boolean
        }
        Insert: {
          checklist_item_id: string
          completed_at?: string | null
          completed_by?: string | null
          entry_id: string
          id?: string
          is_completed?: boolean
        }
        Update: {
          checklist_item_id?: string
          completed_at?: string | null
          completed_by?: string | null
          entry_id?: string
          id?: string
          is_completed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "entry_checklist_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_checklist_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_checklist_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_editors: {
        Row: {
          claimed_at: string
          entry_id: string
          id: string
          user_id: string
        }
        Insert: {
          claimed_at?: string
          entry_id: string
          id?: string
          user_id: string
        }
        Update: {
          claimed_at?: string
          entry_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_editors_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_editors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      file_attachments: {
        Row: {
          created_at: string
          entry_id: string
          file_name: string
          file_size: number
          file_url: string
          id: string
          mime_type: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          entry_id: string
          file_name: string
          file_size: number
          file_url: string
          id?: string
          mime_type: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          entry_id?: string
          file_name?: string
          file_size?: number
          file_url?: string
          id?: string
          mime_type?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_attachments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      global_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      graphic_requests: {
        Row: {
          claimed_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          entry_id: string
          file_name: string | null
          file_size: number | null
          file_url: string | null
          flag_reason: string | null
          graphic_status: string
          id: string
          is_featured: boolean
          mime_type: string | null
          storage_path: string | null
          title: string
          updated_at: string
          urgency_date: string | null
          wp_media_id: number | null
        }
        Insert: {
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_id: string
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          flag_reason?: string | null
          graphic_status?: string
          id?: string
          is_featured?: boolean
          mime_type?: string | null
          storage_path?: string | null
          title: string
          updated_at?: string
          urgency_date?: string | null
          wp_media_id?: number | null
        }
        Update: {
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_id?: string
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          flag_reason?: string | null
          graphic_status?: string
          id?: string
          is_featured?: boolean
          mime_type?: string | null
          storage_path?: string | null
          title?: string
          updated_at?: string
          urgency_date?: string | null
          wp_media_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "graphic_requests_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graphic_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graphic_requests_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          event_type: string
          id: string
          in_app_enabled: boolean
          user_id: string
        }
        Insert: {
          event_type: string
          id?: string
          in_app_enabled?: boolean
          user_id: string
        }
        Update: {
          event_type?: string
          id?: string
          in_app_enabled?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string | null
          entry_id: string | null
          id: string
          is_read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          entry_id?: string | null
          id?: string
          is_read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          entry_id?: string | null
          id?: string
          is_read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      raptive_revenue: {
        Row: {
          date: string
          earnings: number
          entry_id: string | null
          id: string
          page_rpm: number
          page_url: string
          pageviews: number
          rpm: number
          sessions: number
          synced_at: string
        }
        Insert: {
          date: string
          earnings?: number
          entry_id?: string | null
          id?: string
          page_rpm?: number
          page_url: string
          pageviews?: number
          rpm?: number
          sessions?: number
          synced_at?: string
        }
        Update: {
          date?: string
          earnings?: number
          entry_id?: string | null
          id?: string
          page_rpm?: number
          page_url?: string
          pageviews?: number
          rpm?: number
          sessions?: number
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "raptive_revenue_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      raptive_uploads: {
        Row: {
          created_at: string
          date_range_end: string
          date_range_start: string
          file_name: string
          id: string
          rows_imported: number
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          date_range_end: string
          date_range_start: string
          file_name: string
          id?: string
          rows_imported?: number
          uploaded_by: string
        }
        Update: {
          created_at?: string
          date_range_end?: string
          date_range_start?: string
          file_name?: string
          id?: string
          rows_imported?: number
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "raptive_uploads_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_template_checklist: {
        Row: {
          checklist_item_id: string
          id: string
          template_id: string
        }
        Insert: {
          checklist_item_id: string
          id?: string
          template_id: string
        }
        Update: {
          checklist_item_id?: string
          id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_template_checklist_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_template_checklist_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "recurring_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_template_roles: {
        Row: {
          id: string
          role: string
          template_id: string
        }
        Insert: {
          id?: string
          role: string
          template_id: string
        }
        Update: {
          id?: string
          role?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_template_roles_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "recurring_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_templates: {
        Row: {
          assigned_user_id: string | null
          category_id: string | null
          created_at: string
          default_publish_time: string | null
          description_template: string | null
          id: string
          is_active: boolean
          schedule_rule: Json
          season_mode_id: string
          site: string
          tier_id: string
          title_pattern: string
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          category_id?: string | null
          created_at?: string
          default_publish_time?: string | null
          description_template?: string | null
          id?: string
          is_active?: boolean
          schedule_rule: Json
          season_mode_id: string
          site: string
          tier_id: string
          title_pattern: string
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          category_id?: string | null
          created_at?: string
          default_publish_time?: string | null
          description_template?: string | null
          id?: string
          is_active?: boolean
          schedule_rule?: Json
          season_mode_id?: string
          site?: string
          tier_id?: string
          title_pattern?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_templates_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_templates_category_site_fkey"
            columns: ["category_id", "site"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "site"]
          },
          {
            foreignKeyName: "recurring_templates_season_mode_id_fkey"
            columns: ["season_mode_id"]
            isOneToOne: false
            referencedRelation: "season_modes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_templates_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_table_views: {
        Row: {
          columns: Json | null
          created_at: string
          filters: Json | null
          grouping: string | null
          id: string
          is_default: boolean
          name: string
          sort: Json | null
          user_id: string
        }
        Insert: {
          columns?: Json | null
          created_at?: string
          filters?: Json | null
          grouping?: string | null
          id?: string
          is_default?: boolean
          name: string
          sort?: Json | null
          user_id: string
        }
        Update: {
          columns?: Json | null
          created_at?: string
          filters?: Json | null
          grouping?: string | null
          id?: string
          is_default?: boolean
          name?: string
          sort?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_table_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      season_modes: {
        Row: {
          auto_switch_end: string | null
          auto_switch_start: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          auto_switch_end?: string | null
          auto_switch_start?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          auto_switch_end?: string | null
          auto_switch_start?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          refresh_token_hash: string
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          refresh_token_hash: string
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token_hash?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          description: string | null
          id: string
          manager_id: string
          name: string
          site: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          manager_id: string
          name: string
          site: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          manager_id?: string
          name?: string
          site?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tiers: {
        Row: {
          created_at: string
          id: string
          label: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: string
          site: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          site: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          site?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auto_approve_drafts: boolean
          avatar_url: string | null
          bio: string | null
          bluesky_handle: string | null
          can_publish: boolean
          created_at: string
          display_name: string
          display_name_override: boolean
          email: string | null
          id: string
          last_wp_sync: string | null
          onboarding_completed: boolean
          theme: string
          timezone: string
          twitter_handle: string | null
          updated_at: string
          wp_site: string
          wp_user_id: number
        }
        Insert: {
          auto_approve_drafts?: boolean
          avatar_url?: string | null
          bio?: string | null
          bluesky_handle?: string | null
          can_publish?: boolean
          created_at?: string
          display_name: string
          display_name_override?: boolean
          email?: string | null
          id?: string
          last_wp_sync?: string | null
          onboarding_completed?: boolean
          theme?: string
          timezone?: string
          twitter_handle?: string | null
          updated_at?: string
          wp_site: string
          wp_user_id: number
        }
        Update: {
          auto_approve_drafts?: boolean
          avatar_url?: string | null
          bio?: string | null
          bluesky_handle?: string | null
          can_publish?: boolean
          created_at?: string
          display_name?: string
          display_name_override?: boolean
          email?: string | null
          id?: string
          last_wp_sync?: string | null
          onboarding_completed?: boolean
          theme?: string
          timezone?: string
          twitter_handle?: string | null
          updated_at?: string
          wp_site?: string
          wp_user_id?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_season_mode: { Args: { p_mode_id: string }; Returns: boolean }
      bulk_create_entries: {
        Args: { p_actor_id: string; p_entries: Json }
        Returns: {
          entry_id: string
          request_index: number
        }[]
      }
      bulk_update_entries: {
        Args: {
          p_action: string
          p_actor_id: string
          p_entry_ids: string[]
          p_payload?: Json
        }
        Returns: number
      }
      claim_cron_run: {
        Args: {
          p_job_name: string
          p_lease_seconds?: number
          p_run_key: string
          p_source: string
        }
        Returns: {
          attempt: number
          claim_status: string
          run_id: string
        }[]
      }
      finish_cron_run: {
        Args: {
          p_error_code?: string
          p_run_id: string
          p_succeeded: boolean
          p_summary?: Json
        }
        Returns: boolean
      }
      get_analytics_overview: {
        Args: {
          p_author_id?: string
          p_category_id?: string
          p_date_from: string
          p_date_to: string
          p_site?: string
          p_tier_id?: string
        }
        Returns: {
          avg_time_on_page: number
          category_id: string
          date: string
          earnings: number
          entry_id: string
          pageviews: number
          publish_date: string
          sessions: number
          site: string
          tier_id: string
          title: string
          word_count: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
