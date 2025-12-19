export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      api_usage: {
        Row: {
          cost_usd: number | null
          created_at: string | null
          id: string
          job_run_id: string | null
          operation: string
          region: string | null
          service_name: string
          tokens_used: number | null
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string | null
          id?: string
          job_run_id?: string | null
          operation: string
          region?: string | null
          service_name: string
          tokens_used?: number | null
        }
        Update: {
          cost_usd?: number | null
          created_at?: string | null
          id?: string
          job_run_id?: string | null
          operation?: string
          region?: string | null
          service_name?: string
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_job_run_id_fkey"
            columns: ["job_run_id"]
            isOneToOne: false
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      article_duplicates: {
        Row: {
          created_at: string
          detection_method: string
          duplicate_article_id: string
          id: string
          original_article_id: string
          similarity_score: number
        }
        Insert: {
          created_at?: string
          detection_method: string
          duplicate_article_id: string
          id?: string
          original_article_id: string
          similarity_score: number
        }
        Update: {
          created_at?: string
          detection_method?: string
          duplicate_article_id?: string
          id?: string
          original_article_id?: string
          similarity_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "article_duplicates_duplicate_article_id_fkey"
            columns: ["duplicate_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_duplicates_original_article_id_fkey"
            columns: ["original_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      article_duplicates_pending: {
        Row: {
          created_at: string
          detection_method: string
          duplicate_article_id: string
          id: string
          merged_at: string | null
          merged_by: string | null
          original_article_id: string
          similarity_score: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          detection_method: string
          duplicate_article_id: string
          id?: string
          merged_at?: string | null
          merged_by?: string | null
          original_article_id: string
          similarity_score: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          detection_method?: string
          duplicate_article_id?: string
          id?: string
          merged_at?: string | null
          merged_by?: string | null
          original_article_id?: string
          similarity_score?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_duplicates_pending_duplicate_article_id_fkey"
            columns: ["duplicate_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_duplicates_pending_original_article_id_fkey"
            columns: ["original_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          author: string | null
          body: string | null
          canonical_url: string | null
          category: string | null
          content_checksum: string | null
          content_quality_score: number | null
          copyright_flags: Json | null
          created_at: string
          extraction_attempts: number | null
          id: string
          image_url: string | null
          import_metadata: Json | null
          keywords: string[] | null
          language: string | null
          last_extraction_attempt: string | null
          originality_confidence: number | null
          processing_status: string
          published_at: string | null
          reading_time_minutes: number | null
          region: string | null
          regional_relevance_score: number | null
          search: unknown
          source_id: string | null
          source_url: string
          summary: string | null
          tags: string[] | null
          title: string
          topic_id: string | null
          updated_at: string
          word_count: number | null
        }
        Insert: {
          author?: string | null
          body?: string | null
          canonical_url?: string | null
          category?: string | null
          content_checksum?: string | null
          content_quality_score?: number | null
          copyright_flags?: Json | null
          created_at?: string
          extraction_attempts?: number | null
          id?: string
          image_url?: string | null
          import_metadata?: Json | null
          keywords?: string[] | null
          language?: string | null
          last_extraction_attempt?: string | null
          originality_confidence?: number | null
          processing_status?: string
          published_at?: string | null
          reading_time_minutes?: number | null
          region?: string | null
          regional_relevance_score?: number | null
          search?: unknown
          source_id?: string | null
          source_url: string
          summary?: string | null
          tags?: string[] | null
          title: string
          topic_id?: string | null
          updated_at?: string
          word_count?: number | null
        }
        Update: {
          author?: string | null
          body?: string | null
          canonical_url?: string | null
          category?: string | null
          content_checksum?: string | null
          content_quality_score?: number | null
          copyright_flags?: Json | null
          created_at?: string
          extraction_attempts?: number | null
          id?: string
          image_url?: string | null
          import_metadata?: Json | null
          keywords?: string[] | null
          language?: string | null
          last_extraction_attempt?: string | null
          originality_confidence?: number | null
          processing_status?: string
          published_at?: string | null
          reading_time_minutes?: number | null
          region?: string | null
          regional_relevance_score?: number | null
          search?: unknown
          source_id?: string | null
          source_url?: string
          summary?: string | null
          tags?: string[] | null
          title?: string
          topic_id?: string | null
          updated_at?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "articles_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "content_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "content_sources_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      automated_insight_cards: {
        Row: {
          card_type: string
          created_at: string | null
          display_count: number | null
          display_frequency: number | null
          headline: string
          id: string
          insight_data: Json | null
          is_published: boolean | null
          is_visible: boolean | null
          last_shown_at: string | null
          relevance_score: number | null
          slides: Json | null
          topic_id: string
          updated_at: string | null
          valid_until: string
        }
        Insert: {
          card_type: string
          created_at?: string | null
          display_count?: number | null
          display_frequency?: number | null
          headline: string
          id?: string
          insight_data?: Json | null
          is_published?: boolean | null
          is_visible?: boolean | null
          last_shown_at?: string | null
          relevance_score?: number | null
          slides?: Json | null
          topic_id: string
          updated_at?: string | null
          valid_until: string
        }
        Update: {
          card_type?: string
          created_at?: string | null
          display_count?: number | null
          display_frequency?: number | null
          headline?: string
          id?: string
          insight_data?: Json | null
          is_published?: boolean | null
          is_visible?: boolean | null
          last_shown_at?: string | null
          relevance_score?: number | null
          slides?: Json | null
          topic_id?: string
          updated_at?: string | null
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "automated_insight_cards_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automated_insight_cards_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      carousel_exports: {
        Row: {
          created_at: string
          error_message: string | null
          export_formats: Json
          file_paths: Json
          id: string
          status: string
          story_id: string
          updated_at: string
          zip_url: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          export_formats?: Json
          file_paths?: Json
          id?: string
          status?: string
          story_id: string
          updated_at?: string
          zip_url?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          export_formats?: Json
          file_paths?: Json
          id?: string
          status?: string
          story_id?: string
          updated_at?: string
          zip_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carousel_exports_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: true
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      community_insights: {
        Row: {
          confidence_score: number | null
          content: string
          created_at: string
          expires_at: string | null
          id: string
          insight_type: string
          metadata: Json | null
          source_identifier: string
          source_type: string
          topic_id: string
        }
        Insert: {
          confidence_score?: number | null
          content: string
          created_at?: string
          expires_at?: string | null
          id?: string
          insight_type: string
          metadata?: Json | null
          source_identifier: string
          source_type?: string
          topic_id: string
        }
        Update: {
          confidence_score?: number | null
          content?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          insight_type?: string
          metadata?: Json | null
          source_identifier?: string
          source_type?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_insights_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_insights_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      community_pulse_keywords: {
        Row: {
          analysis_date: string | null
          created_at: string | null
          id: string
          is_visible: boolean | null
          keyword: string
          most_active_thread_title: string | null
          most_active_thread_url: string | null
          negative_mentions: number | null
          positive_mentions: number | null
          representative_quote: string | null
          set_number: number | null
          subreddit: string | null
          topic_id: string
          total_mentions: number | null
          updated_at: string | null
        }
        Insert: {
          analysis_date?: string | null
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          keyword: string
          most_active_thread_title?: string | null
          most_active_thread_url?: string | null
          negative_mentions?: number | null
          positive_mentions?: number | null
          representative_quote?: string | null
          set_number?: number | null
          subreddit?: string | null
          topic_id: string
          total_mentions?: number | null
          updated_at?: string | null
        }
        Update: {
          analysis_date?: string | null
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          keyword?: string
          most_active_thread_title?: string | null
          most_active_thread_url?: string | null
          negative_mentions?: number | null
          positive_mentions?: number | null
          representative_quote?: string | null
          set_number?: number | null
          subreddit?: string | null
          topic_id?: string
          total_mentions?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_pulse_keywords_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_pulse_keywords_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      content_generation_queue: {
        Row: {
          ai_provider: string | null
          article_id: string
          attempts: number
          audience_expertise:
            | Database["public"]["Enums"]["audience_expertise"]
            | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          max_attempts: number
          result_data: Json | null
          shared_content_id: string | null
          slidetype: string
          started_at: string | null
          status: string
          tone: Database["public"]["Enums"]["tone_type"] | null
          topic_article_id: string | null
          writing_style: string | null
        }
        Insert: {
          ai_provider?: string | null
          article_id: string
          attempts?: number
          audience_expertise?:
            | Database["public"]["Enums"]["audience_expertise"]
            | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          max_attempts?: number
          result_data?: Json | null
          shared_content_id?: string | null
          slidetype?: string
          started_at?: string | null
          status?: string
          tone?: Database["public"]["Enums"]["tone_type"] | null
          topic_article_id?: string | null
          writing_style?: string | null
        }
        Update: {
          ai_provider?: string | null
          article_id?: string
          attempts?: number
          audience_expertise?:
            | Database["public"]["Enums"]["audience_expertise"]
            | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          max_attempts?: number
          result_data?: Json | null
          shared_content_id?: string | null
          slidetype?: string
          started_at?: string | null
          status?: string
          tone?: Database["public"]["Enums"]["tone_type"] | null
          topic_article_id?: string | null
          writing_style?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_generation_queue_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_generation_queue_shared_content_id_fkey"
            columns: ["shared_content_id"]
            isOneToOne: false
            referencedRelation: "shared_article_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_generation_queue_topic_article_id_fkey"
            columns: ["topic_article_id"]
            isOneToOne: false
            referencedRelation: "topic_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_sources: {
        Row: {
          articles_scraped: number | null
          avg_response_time_ms: number | null
          canonical_domain: string | null
          confirmed_arc_section: string | null
          consecutive_failures: number | null
          content_type: string | null
          created_at: string | null
          credibility_score: number | null
          feed_url: string | null
          id: string
          is_active: boolean | null
          is_blacklisted: boolean | null
          is_critical: boolean | null
          is_whitelisted: boolean | null
          last_failure_at: string | null
          last_failure_reason: string | null
          last_scraped_at: string | null
          recommend_replacement: boolean | null
          region: string | null
          scrape_frequency_hours: number | null
          scraping_config: Json | null
          scraping_method: string | null
          source_name: string
          source_type: string | null
          success_rate: number | null
          topic_id: string | null
          total_failures: number | null
          updated_at: string | null
        }
        Insert: {
          articles_scraped?: number | null
          avg_response_time_ms?: number | null
          canonical_domain?: string | null
          confirmed_arc_section?: string | null
          consecutive_failures?: number | null
          content_type?: string | null
          created_at?: string | null
          credibility_score?: number | null
          feed_url?: string | null
          id?: string
          is_active?: boolean | null
          is_blacklisted?: boolean | null
          is_critical?: boolean | null
          is_whitelisted?: boolean | null
          last_failure_at?: string | null
          last_failure_reason?: string | null
          last_scraped_at?: string | null
          recommend_replacement?: boolean | null
          region?: string | null
          scrape_frequency_hours?: number | null
          scraping_config?: Json | null
          scraping_method?: string | null
          source_name: string
          source_type?: string | null
          success_rate?: number | null
          topic_id?: string | null
          total_failures?: number | null
          updated_at?: string | null
        }
        Update: {
          articles_scraped?: number | null
          avg_response_time_ms?: number | null
          canonical_domain?: string | null
          confirmed_arc_section?: string | null
          consecutive_failures?: number | null
          content_type?: string | null
          created_at?: string | null
          credibility_score?: number | null
          feed_url?: string | null
          id?: string
          is_active?: boolean | null
          is_blacklisted?: boolean | null
          is_critical?: boolean | null
          is_whitelisted?: boolean | null
          last_failure_at?: string | null
          last_failure_reason?: string | null
          last_scraped_at?: string | null
          recommend_replacement?: boolean | null
          region?: string | null
          scrape_frequency_hours?: number | null
          scraping_config?: Json | null
          scraping_method?: string | null
          source_name?: string
          source_type?: string | null
          success_rate?: number | null
          topic_id?: string | null
          total_failures?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_sources_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_sources_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          created_at: string
          credits_amount: number
          credits_balance_after: number
          description: string | null
          id: string
          metadata: Json | null
          related_story_id: string | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_amount: number
          credits_balance_after: number
          description?: string | null
          id?: string
          metadata?: Json | null
          related_story_id?: string | null
          transaction_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_amount?: number
          credits_balance_after?: number
          description?: string | null
          id?: string
          metadata?: Json | null
          related_story_id?: string | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_related_story_id_fkey"
            columns: ["related_story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_content_availability: {
        Row: {
          articles_scraped_count: number | null
          auto_scrape_completed_at: string | null
          auto_scrape_triggered: boolean | null
          check_date: string
          check_duration_ms: number | null
          created_at: string | null
          discovery_method: string | null
          error_message: string | null
          id: string
          new_urls_found: number
          source_id: string
          success: boolean
          topic_id: string
          topic_relevant_urls: number | null
          total_urls_discovered: number
          updated_at: string | null
          urls_already_seen: number
        }
        Insert: {
          articles_scraped_count?: number | null
          auto_scrape_completed_at?: string | null
          auto_scrape_triggered?: boolean | null
          check_date?: string
          check_duration_ms?: number | null
          created_at?: string | null
          discovery_method?: string | null
          error_message?: string | null
          id?: string
          new_urls_found?: number
          source_id: string
          success?: boolean
          topic_id: string
          topic_relevant_urls?: number | null
          total_urls_discovered?: number
          updated_at?: string | null
          urls_already_seen?: number
        }
        Update: {
          articles_scraped_count?: number | null
          auto_scrape_completed_at?: string | null
          auto_scrape_triggered?: boolean | null
          check_date?: string
          check_duration_ms?: number | null
          created_at?: string | null
          discovery_method?: string | null
          error_message?: string | null
          id?: string
          new_urls_found?: number
          source_id?: string
          success?: boolean
          topic_id?: string
          topic_relevant_urls?: number | null
          total_urls_discovered?: number
          updated_at?: string | null
          urls_already_seen?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_content_availability_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "content_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_content_availability_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "content_sources_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_content_availability_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_content_availability_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      discarded_articles: {
        Row: {
          created_at: string
          discarded_at: string
          discarded_by: string | null
          discarded_reason: string
          id: string
          normalized_url: string
          source_id: string | null
          title: string | null
          topic_id: string | null
          url: string
        }
        Insert: {
          created_at?: string
          discarded_at?: string
          discarded_by?: string | null
          discarded_reason: string
          id?: string
          normalized_url: string
          source_id?: string | null
          title?: string | null
          topic_id?: string | null
          url: string
        }
        Update: {
          created_at?: string
          discarded_at?: string
          discarded_by?: string | null
          discarded_reason?: string
          id?: string
          normalized_url?: string
          source_id?: string | null
          title?: string | null
          topic_id?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "discarded_articles_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "content_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discarded_articles_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "content_sources_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discarded_articles_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discarded_articles_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      error_notifications: {
        Row: {
          created_at: string
          delivered_at: string | null
          id: string
          notification_type: string
          read_at: string | null
          ticket_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          notification_type?: string
          read_at?: string | null
          ticket_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          notification_type?: string
          read_at?: string | null
          ticket_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_notifications_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "error_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      error_tickets: {
        Row: {
          archived_at: string | null
          assigned_to: string | null
          context_data: Json | null
          created_at: string
          error_code: string | null
          error_details: string
          id: string
          resolution_notes: string | null
          resolved_at: string | null
          severity: string | null
          source_info: Json
          stack_trace: string | null
          status: string
          ticket_type: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          assigned_to?: string | null
          context_data?: Json | null
          created_at?: string
          error_code?: string | null
          error_details: string
          id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string | null
          source_info?: Json
          stack_trace?: string | null
          status?: string
          ticket_type: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string | null
          context_data?: Json | null
          created_at?: string
          error_code?: string | null
          error_details?: string
          id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string | null
          source_info?: Json
          stack_trace?: string | null
          status?: string
          ticket_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          end_time: string | null
          event_type: string
          id: string
          location: string | null
          price: string | null
          rank_position: number | null
          source_api: string | null
          source_name: string | null
          source_url: string | null
          start_date: string
          start_time: string | null
          status: string
          title: string
          topic_id: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          event_type: string
          id?: string
          location?: string | null
          price?: string | null
          rank_position?: number | null
          source_api?: string | null
          source_name?: string | null
          source_url?: string | null
          start_date: string
          start_time?: string | null
          status?: string
          title: string
          topic_id: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          event_type?: string
          id?: string
          location?: string | null
          price?: string | null
          rank_position?: number | null
          source_api?: string | null
          source_name?: string | null
          source_url?: string | null
          start_date?: string
          start_time?: string | null
          status?: string
          title?: string
          topic_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          config: Json | null
          created_at: string | null
          description: string | null
          enabled: boolean | null
          flag_name: string
          id: string
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          flag_name: string
          id?: string
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          flag_name?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      feed_cta_configs: {
        Row: {
          attribution_cta: string | null
          created_at: string
          engagement_question: string | null
          feed_name: string
          id: string
          is_active: boolean
          show_like_share: boolean
          topic_id: string | null
          updated_at: string
        }
        Insert: {
          attribution_cta?: string | null
          created_at?: string
          engagement_question?: string | null
          feed_name: string
          id?: string
          is_active?: boolean
          show_like_share?: boolean
          topic_id?: string | null
          updated_at?: string
        }
        Update: {
          attribution_cta?: string | null
          created_at?: string
          engagement_question?: string | null
          feed_name?: string
          id?: string
          is_active?: boolean
          show_like_share?: boolean
          topic_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_cta_configs_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_cta_configs_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_visits: {
        Row: {
          created_at: string
          id: string
          page_type: string | null
          referrer: string | null
          topic_id: string
          user_agent: string | null
          visit_date: string
          visit_timestamp: string
          visitor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          page_type?: string | null
          referrer?: string | null
          topic_id: string
          user_agent?: string | null
          visit_date?: string
          visit_timestamp?: string
          visitor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          page_type?: string | null
          referrer?: string | null
          topic_id?: string
          user_agent?: string | null
          visit_date?: string
          visit_timestamp?: string
          visitor_id?: string
        }
        Relationships: []
      }
      image_generation_tests: {
        Row: {
          api_provider: string
          created_at: string
          error_message: string | null
          estimated_cost: number | null
          generation_time_ms: number | null
          id: string
          slide_id: string | null
          story_id: string | null
          style_reference_used: boolean | null
          success: boolean
          test_id: string | null
          updated_at: string
          visual_id: string | null
        }
        Insert: {
          api_provider: string
          created_at?: string
          error_message?: string | null
          estimated_cost?: number | null
          generation_time_ms?: number | null
          id?: string
          slide_id?: string | null
          story_id?: string | null
          style_reference_used?: boolean | null
          success?: boolean
          test_id?: string | null
          updated_at?: string
          visual_id?: string | null
        }
        Update: {
          api_provider?: string
          created_at?: string
          error_message?: string | null
          estimated_cost?: number | null
          generation_time_ms?: number | null
          id?: string
          slide_id?: string | null
          story_id?: string | null
          style_reference_used?: boolean | null
          success?: boolean
          test_id?: string | null
          updated_at?: string
          visual_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "image_generation_tests_visual_id_fkey"
            columns: ["visual_id"]
            isOneToOne: false
            referencedRelation: "visuals"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runs: {
        Row: {
          attempts: number | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          idempotency_key: string | null
          input_data: Json | null
          job_type: string
          max_attempts: number | null
          output_data: Json | null
          scheduled_at: string | null
          started_at: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          attempts?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          input_data?: Json | null
          job_type: string
          max_attempts?: number | null
          output_data?: Json | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          attempts?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          input_data?: Json | null
          job_type?: string
          max_attempts?: number | null
          output_data?: Json | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      keyword_analytics: {
        Row: {
          created_at: string | null
          id: string
          keyword: string
          success_metrics: Json | null
          topic_type: string
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          keyword: string
          success_metrics?: Json | null
          topic_type: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          keyword?: string
          success_metrics?: Json | null
          topic_type?: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      newsletter_signup_rate_limits: {
        Row: {
          created_at: string | null
          email_hash: string
          id: string
          ip_hash: string
          signup_count: number | null
          updated_at: string | null
          window_duration: unknown
          window_start: string | null
        }
        Insert: {
          created_at?: string | null
          email_hash: string
          id?: string
          ip_hash: string
          signup_count?: number | null
          updated_at?: string | null
          window_duration?: unknown
          window_start?: string | null
        }
        Update: {
          created_at?: string | null
          email_hash?: string
          id?: string
          ip_hash?: string
          signup_count?: number | null
          updated_at?: string | null
          window_duration?: unknown
          window_start?: string | null
        }
        Relationships: []
      }
      parliamentary_mentions: {
        Row: {
          aye_count: number | null
          bill_description: string | null
          bill_stage: string | null
          constituency: string | null
          created_at: string | null
          debate_date: string | null
          debate_excerpt: string | null
          debate_title: string | null
          hansard_url: string | null
          id: string
          import_metadata: Json | null
          is_major_vote: boolean | null
          is_rebellion: boolean | null
          is_weekly_roundup: boolean | null
          landmark_mentioned: string | null
          local_impact_summary: string | null
          mention_type: string
          mp_name: string | null
          national_relevance_score: number | null
          no_count: number | null
          party: string | null
          party_whip_vote: string | null
          region_mentioned: string | null
          relevance_score: number | null
          source_api: string | null
          story_id: string | null
          topic_id: string
          updated_at: string | null
          vote_category: string | null
          vote_context: string | null
          vote_date: string | null
          vote_direction: string | null
          vote_outcome: string | null
          vote_title: string | null
          vote_url: string | null
          week_start_date: string | null
        }
        Insert: {
          aye_count?: number | null
          bill_description?: string | null
          bill_stage?: string | null
          constituency?: string | null
          created_at?: string | null
          debate_date?: string | null
          debate_excerpt?: string | null
          debate_title?: string | null
          hansard_url?: string | null
          id?: string
          import_metadata?: Json | null
          is_major_vote?: boolean | null
          is_rebellion?: boolean | null
          is_weekly_roundup?: boolean | null
          landmark_mentioned?: string | null
          local_impact_summary?: string | null
          mention_type: string
          mp_name?: string | null
          national_relevance_score?: number | null
          no_count?: number | null
          party?: string | null
          party_whip_vote?: string | null
          region_mentioned?: string | null
          relevance_score?: number | null
          source_api?: string | null
          story_id?: string | null
          topic_id: string
          updated_at?: string | null
          vote_category?: string | null
          vote_context?: string | null
          vote_date?: string | null
          vote_direction?: string | null
          vote_outcome?: string | null
          vote_title?: string | null
          vote_url?: string | null
          week_start_date?: string | null
        }
        Update: {
          aye_count?: number | null
          bill_description?: string | null
          bill_stage?: string | null
          constituency?: string | null
          created_at?: string | null
          debate_date?: string | null
          debate_excerpt?: string | null
          debate_title?: string | null
          hansard_url?: string | null
          id?: string
          import_metadata?: Json | null
          is_major_vote?: boolean | null
          is_rebellion?: boolean | null
          is_weekly_roundup?: boolean | null
          landmark_mentioned?: string | null
          local_impact_summary?: string | null
          mention_type?: string
          mp_name?: string | null
          national_relevance_score?: number | null
          no_count?: number | null
          party?: string | null
          party_whip_vote?: string | null
          region_mentioned?: string | null
          relevance_score?: number | null
          source_api?: string | null
          story_id?: string | null
          topic_id?: string
          updated_at?: string | null
          vote_category?: string | null
          vote_context?: string | null
          vote_date?: string | null
          vote_direction?: string | null
          vote_outcome?: string | null
          vote_title?: string | null
          vote_url?: string | null
          week_start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parliamentary_mentions_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          caption: string | null
          created_at: string
          hashtags: Json | null
          id: string
          platform: string
          published_at: string | null
          scheduled_at: string | null
          source_attribution: string | null
          status: string
          story_id: string
          updated_at: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          hashtags?: Json | null
          id?: string
          platform: string
          published_at?: string | null
          scheduled_at?: string | null
          source_attribution?: string | null
          status?: string
          story_id: string
          updated_at?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          hashtags?: Json | null
          id?: string
          platform?: string
          published_at?: string | null
          scheduled_at?: string | null
          source_attribution?: string | null
          status?: string
          story_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_templates: {
        Row: {
          audience_expertise:
            | Database["public"]["Enums"]["audience_expertise"]
            | null
          category: string
          created_at: string | null
          id: string
          is_active: boolean | null
          prompt_content: string
          slide_type: string | null
          template_name: string
          tone_type: Database["public"]["Enums"]["tone_type"] | null
          updated_at: string | null
          variables: Json | null
          version: number
        }
        Insert: {
          audience_expertise?:
            | Database["public"]["Enums"]["audience_expertise"]
            | null
          category: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          prompt_content: string
          slide_type?: string | null
          template_name: string
          tone_type?: Database["public"]["Enums"]["tone_type"] | null
          updated_at?: string | null
          variables?: Json | null
          version?: number
        }
        Update: {
          audience_expertise?:
            | Database["public"]["Enums"]["audience_expertise"]
            | null
          category?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          prompt_content?: string
          slide_type?: string | null
          template_name?: string
          tone_type?: Database["public"]["Enums"]["tone_type"] | null
          updated_at?: string | null
          variables?: Json | null
          version?: number
        }
        Relationships: []
      }
      quality_reports: {
        Row: {
          analysis_data: Json | null
          brand_safety_issues: Json | null
          brand_safety_score: number
          compliance_data: Json | null
          content_quality_score: number
          created_at: string
          id: string
          overall_score: number
          recommendations: Json | null
          regional_relevance_score: number
          story_id: string
          updated_at: string
        }
        Insert: {
          analysis_data?: Json | null
          brand_safety_issues?: Json | null
          brand_safety_score?: number
          compliance_data?: Json | null
          content_quality_score?: number
          created_at?: string
          id?: string
          overall_score?: number
          recommendations?: Json | null
          regional_relevance_score?: number
          story_id: string
          updated_at?: string
        }
        Update: {
          analysis_data?: Json | null
          brand_safety_issues?: Json | null
          brand_safety_score?: number
          compliance_data?: Json | null
          content_quality_score?: number
          created_at?: string
          id?: string
          overall_score?: number
          recommendations?: Json | null
          regional_relevance_score?: number
          story_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      quiz_questions: {
        Row: {
          category: string | null
          correct_option: string
          correct_responses: number | null
          created_at: string | null
          difficulty: string | null
          explanation: string | null
          id: string
          is_published: boolean | null
          option_distribution: Json | null
          options: Json
          question_text: string
          source_story_id: string | null
          topic_id: string
          total_responses: number | null
          updated_at: string | null
          valid_until: string
        }
        Insert: {
          category?: string | null
          correct_option: string
          correct_responses?: number | null
          created_at?: string | null
          difficulty?: string | null
          explanation?: string | null
          id?: string
          is_published?: boolean | null
          option_distribution?: Json | null
          options: Json
          question_text: string
          source_story_id?: string | null
          topic_id: string
          total_responses?: number | null
          updated_at?: string | null
          valid_until: string
        }
        Update: {
          category?: string | null
          correct_option?: string
          correct_responses?: number | null
          created_at?: string | null
          difficulty?: string | null
          explanation?: string | null
          id?: string
          is_published?: boolean | null
          option_distribution?: Json | null
          options?: Json
          question_text?: string
          source_story_id?: string | null
          topic_id?: string
          total_responses?: number | null
          updated_at?: string | null
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_source_story_id_fkey"
            columns: ["source_story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_responses: {
        Row: {
          created_at: string | null
          id: string
          is_correct: boolean
          question_id: string
          response_time_ms: number | null
          selected_option: string
          user_id: string | null
          visitor_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_correct: boolean
          question_id: string
          response_time_ms?: number | null
          selected_option: string
          user_id?: string | null
          visitor_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_correct?: boolean
          question_id?: string
          response_time_ms?: number | null
          selected_option?: string
          user_id?: string | null
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          max_requests: number
          requests: number
          user_id: string | null
          window_duration: unknown
          window_start: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          max_requests?: number
          requests?: number
          user_id?: string | null
          window_duration?: unknown
          window_start?: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          max_requests?: number
          requests?: number
          user_id?: string | null
          window_duration?: unknown
          window_start?: string
        }
        Relationships: []
      }
      reader_profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
          last_active_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id?: string
          last_active_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          last_active_at?: string
          user_id?: string
        }
        Relationships: []
      }
      request_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          endpoint: string
          error_message: string | null
          id: string
          metadata: Json | null
          method: string
          request_id: string
          status_code: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          endpoint: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          method: string
          request_id: string
          status_code?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          endpoint?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          method?: string
          request_id?: string
          status_code?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      saved_filters: {
        Row: {
          created_at: string
          description: string | null
          filters: Json
          id: string
          is_public: boolean | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          filters?: Json
          id?: string
          is_public?: boolean | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          filters?: Json
          id?: string
          is_public?: boolean | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduler_settings: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      scrape_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          job_type: string
          max_retries: number
          result_data: Json | null
          retry_count: number
          schedule_id: string
          source_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_type?: string
          max_retries?: number
          result_data?: Json | null
          retry_count?: number
          schedule_id: string
          source_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_type?: string
          max_retries?: number
          result_data?: Json | null
          retry_count?: number
          schedule_id?: string
          source_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_scrape_jobs_schedule_id"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "scrape_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_scrape_jobs_source_id"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "content_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_scrape_jobs_source_id"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "content_sources_basic"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_schedules: {
        Row: {
          created_at: string
          frequency_hours: number
          id: string
          is_active: boolean
          last_run_at: string | null
          next_run_at: string
          run_count: number
          schedule_type: string
          source_id: string
          success_rate: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          frequency_hours?: number
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          next_run_at?: string
          run_count?: number
          schedule_type?: string
          source_id: string
          success_rate?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          frequency_hours?: number
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          next_run_at?: string
          run_count?: number
          schedule_type?: string
          source_id?: string
          success_rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_scrape_schedules_source_id"
            columns: ["source_id"]
            isOneToOne: true
            referencedRelation: "content_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_scrape_schedules_source_id"
            columns: ["source_id"]
            isOneToOne: true
            referencedRelation: "content_sources_basic"
            referencedColumns: ["id"]
          },
        ]
      }
      scraped_urls_history: {
        Row: {
          created_at: string
          first_scraped_at: string
          id: string
          last_seen_at: string
          source_id: string | null
          status: string | null
          topic_id: string | null
          url: string
        }
        Insert: {
          created_at?: string
          first_scraped_at?: string
          id?: string
          last_seen_at?: string
          source_id?: string | null
          status?: string | null
          topic_id?: string | null
          url: string
        }
        Update: {
          created_at?: string
          first_scraped_at?: string
          id?: string
          last_seen_at?: string
          source_id?: string | null
          status?: string | null
          topic_id?: string | null
          url?: string
        }
        Relationships: []
      }
      scraper_domain_profiles: {
        Row: {
          created_at: string
          domain_key: string
          id: string
          profile: Json
          tenant_id: string | null
          topic_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain_key: string
          id?: string
          profile?: Json
          tenant_id?: string | null
          topic_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain_key?: string
          id?: string
          profile?: Json
          tenant_id?: string | null
          topic_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scraper_domain_profiles_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scraper_domain_profiles_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      scraping_automation: {
        Row: {
          created_at: string | null
          failure_count: number | null
          id: string
          is_active: boolean | null
          last_error: string | null
          last_scraped_at: string | null
          next_scrape_at: string | null
          scrape_frequency_hours: number | null
          source_url: string
          success_count: number | null
          topic_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_scraped_at?: string | null
          next_scrape_at?: string | null
          scrape_frequency_hours?: number | null
          source_url: string
          success_count?: number | null
          topic_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_scraped_at?: string | null
          next_scrape_at?: string | null
          scrape_frequency_hours?: number | null
          source_url?: string
          success_count?: number | null
          topic_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scraping_automation_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scraping_automation_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      search_queries: {
        Row: {
          created_at: string
          execution_time_ms: number | null
          filters: Json | null
          id: string
          query_text: string
          results_count: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          execution_time_ms?: number | null
          filters?: Json | null
          id?: string
          query_text: string
          results_count?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          execution_time_ms?: number | null
          filters?: Json | null
          id?: string
          query_text?: string
          results_count?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      sentiment_cards: {
        Row: {
          analysis_date: string
          card_category: string | null
          card_type: string | null
          card_version: number | null
          comparison_keyword_ids: string[] | null
          confidence_score: number | null
          content: Json
          content_fingerprint: string | null
          created_at: string | null
          data_window_end: string | null
          data_window_start: string | null
          display_count: number | null
          id: string
          is_published: boolean | null
          is_visible: boolean | null
          keyword_phrase: string
          last_shown_at: string | null
          needs_review: boolean | null
          previous_sentiment_score: number | null
          sentiment_direction: string | null
          sentiment_score: number | null
          slides: Json | null
          sources: Json
          topic_id: string | null
          update_reason: string | null
          updated_at: string | null
        }
        Insert: {
          analysis_date?: string
          card_category?: string | null
          card_type?: string | null
          card_version?: number | null
          comparison_keyword_ids?: string[] | null
          confidence_score?: number | null
          content?: Json
          content_fingerprint?: string | null
          created_at?: string | null
          data_window_end?: string | null
          data_window_start?: string | null
          display_count?: number | null
          id?: string
          is_published?: boolean | null
          is_visible?: boolean | null
          keyword_phrase: string
          last_shown_at?: string | null
          needs_review?: boolean | null
          previous_sentiment_score?: number | null
          sentiment_direction?: string | null
          sentiment_score?: number | null
          slides?: Json | null
          sources?: Json
          topic_id?: string | null
          update_reason?: string | null
          updated_at?: string | null
        }
        Update: {
          analysis_date?: string
          card_category?: string | null
          card_type?: string | null
          card_version?: number | null
          comparison_keyword_ids?: string[] | null
          confidence_score?: number | null
          content?: Json
          content_fingerprint?: string | null
          created_at?: string | null
          data_window_end?: string | null
          data_window_start?: string | null
          display_count?: number | null
          id?: string
          is_published?: boolean | null
          is_visible?: boolean | null
          keyword_phrase?: string
          last_shown_at?: string | null
          needs_review?: boolean | null
          previous_sentiment_score?: number | null
          sentiment_direction?: string | null
          sentiment_score?: number | null
          slides?: Json | null
          sources?: Json
          topic_id?: string | null
          update_reason?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sentiment_cards_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sentiment_cards_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      sentiment_keyword_history: {
        Row: {
          created_at: string
          id: string
          keyword_phrase: string
          negative_mentions: number
          neutral_mentions: number
          positive_mentions: number
          sentiment_direction: string | null
          sentiment_ratio: number | null
          source_count: number
          topic_id: string
          total_mentions: number
          week_start_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          keyword_phrase: string
          negative_mentions?: number
          neutral_mentions?: number
          positive_mentions?: number
          sentiment_direction?: string | null
          sentiment_ratio?: number | null
          source_count?: number
          topic_id: string
          total_mentions?: number
          week_start_date: string
        }
        Update: {
          created_at?: string
          id?: string
          keyword_phrase?: string
          negative_mentions?: number
          neutral_mentions?: number
          positive_mentions?: number
          sentiment_direction?: string | null
          sentiment_ratio?: number | null
          source_count?: number
          topic_id?: string
          total_mentions?: number
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "sentiment_keyword_history_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sentiment_keyword_history_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      sentiment_keyword_tracking: {
        Row: {
          created_at: string | null
          current_trend: string | null
          discarded_at: string | null
          first_seen_at: string | null
          id: string
          keyword_phrase: string
          last_auto_resurface_at: string | null
          last_card_generated_at: string | null
          last_seen_at: string | null
          negative_mentions: number | null
          neutral_mentions: number | null
          next_card_due_at: string | null
          positive_mentions: number | null
          published_at: string | null
          review_due_at: string | null
          sentiment_direction: string | null
          sentiment_ratio: number | null
          source_count: number | null
          source_urls: string[] | null
          status: string | null
          topic_id: string
          total_cards_generated: number | null
          total_mentions: number | null
          tracked_for_cards: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_trend?: string | null
          discarded_at?: string | null
          first_seen_at?: string | null
          id?: string
          keyword_phrase: string
          last_auto_resurface_at?: string | null
          last_card_generated_at?: string | null
          last_seen_at?: string | null
          negative_mentions?: number | null
          neutral_mentions?: number | null
          next_card_due_at?: string | null
          positive_mentions?: number | null
          published_at?: string | null
          review_due_at?: string | null
          sentiment_direction?: string | null
          sentiment_ratio?: number | null
          source_count?: number | null
          source_urls?: string[] | null
          status?: string | null
          topic_id: string
          total_cards_generated?: number | null
          total_mentions?: number | null
          tracked_for_cards?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_trend?: string | null
          discarded_at?: string | null
          first_seen_at?: string | null
          id?: string
          keyword_phrase?: string
          last_auto_resurface_at?: string | null
          last_card_generated_at?: string | null
          last_seen_at?: string | null
          negative_mentions?: number | null
          neutral_mentions?: number | null
          next_card_due_at?: string | null
          positive_mentions?: number | null
          published_at?: string | null
          review_due_at?: string | null
          sentiment_direction?: string | null
          sentiment_ratio?: number | null
          source_count?: number | null
          source_urls?: string[] | null
          status?: string | null
          topic_id?: string
          total_cards_generated?: number | null
          total_mentions?: number | null
          tracked_for_cards?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sentiment_keyword_tracking_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sentiment_keyword_tracking_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_article_content: {
        Row: {
          author: string | null
          body: string | null
          canonical_url: string | null
          content_checksum: string | null
          created_at: string
          id: string
          image_url: string | null
          language: string | null
          last_seen_at: string
          normalized_url: string
          published_at: string | null
          source_domain: string | null
          title: string
          updated_at: string
          url: string
          word_count: number | null
        }
        Insert: {
          author?: string | null
          body?: string | null
          canonical_url?: string | null
          content_checksum?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          language?: string | null
          last_seen_at?: string
          normalized_url: string
          published_at?: string | null
          source_domain?: string | null
          title: string
          updated_at?: string
          url: string
          word_count?: number | null
        }
        Update: {
          author?: string | null
          body?: string | null
          canonical_url?: string | null
          content_checksum?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          language?: string | null
          last_seen_at?: string
          normalized_url?: string
          published_at?: string | null
          source_domain?: string | null
          title?: string
          updated_at?: string
          url?: string
          word_count?: number | null
        }
        Relationships: []
      }
      slides: {
        Row: {
          alt_text: string | null
          content: string
          created_at: string
          id: string
          links: Json | null
          slide_number: number
          story_id: string
          updated_at: string
          visual_prompt: string | null
          word_count: number
        }
        Insert: {
          alt_text?: string | null
          content: string
          created_at?: string
          id?: string
          links?: Json | null
          slide_number: number
          story_id: string
          updated_at?: string
          visual_prompt?: string | null
          word_count?: number
        }
        Update: {
          alt_text?: string | null
          content?: string
          created_at?: string
          id?: string
          links?: Json | null
          slide_number?: number
          story_id?: string
          updated_at?: string
          visual_prompt?: string | null
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "slides_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      source_attributions: {
        Row: {
          article_id: string
          created_at: string
          detected_domain: string
          extracted_publication: string
          id: string
          is_valid: boolean | null
          manual_override_by: string | null
          override_reason: string | null
          source_url: string
          updated_at: string
          validation_status: string
        }
        Insert: {
          article_id: string
          created_at?: string
          detected_domain: string
          extracted_publication: string
          id?: string
          is_valid?: boolean | null
          manual_override_by?: string | null
          override_reason?: string | null
          source_url: string
          updated_at?: string
          validation_status?: string
        }
        Update: {
          article_id?: string
          created_at?: string
          detected_domain?: string
          extracted_publication?: string
          id?: string
          is_valid?: boolean | null
          manual_override_by?: string | null
          override_reason?: string | null
          source_url?: string
          updated_at?: string
          validation_status?: string
        }
        Relationships: []
      }
      source_status_audit: {
        Row: {
          change_reason: string | null
          changed_at: string
          changed_by: string | null
          id: string
          metadata: Json | null
          new_status: boolean
          old_status: boolean | null
          source_id: string
        }
        Insert: {
          change_reason?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          metadata?: Json | null
          new_status: boolean
          old_status?: boolean | null
          source_id: string
        }
        Update: {
          change_reason?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          metadata?: Json | null
          new_status?: boolean
          old_status?: boolean | null
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_status_audit_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "content_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_status_audit_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "content_sources_basic"
            referencedColumns: ["id"]
          },
        ]
      }
      stories: {
        Row: {
          animated_illustration_url: string | null
          article_id: string | null
          audience_expertise: string | null
          author: string | null
          constituency: string | null
          cover_illustration_prompt: string | null
          cover_illustration_url: string | null
          created_at: string
          drip_queued_at: string | null
          id: string
          illustration_generated_at: string | null
          is_parliamentary: boolean | null
          is_published: boolean
          last_quality_check: string | null
          mp_name: string | null
          mp_party: string | null
          publication_name: string | null
          quality_score: number | null
          scheduled_publish_at: string | null
          selected_cover_id: string | null
          shared_content_id: string | null
          slide_type: string | null
          slug: string | null
          status: string
          title: string
          tone: string | null
          topic_article_id: string | null
          updated_at: string
          writing_style: string | null
        }
        Insert: {
          animated_illustration_url?: string | null
          article_id?: string | null
          audience_expertise?: string | null
          author?: string | null
          constituency?: string | null
          cover_illustration_prompt?: string | null
          cover_illustration_url?: string | null
          created_at?: string
          drip_queued_at?: string | null
          id?: string
          illustration_generated_at?: string | null
          is_parliamentary?: boolean | null
          is_published?: boolean
          last_quality_check?: string | null
          mp_name?: string | null
          mp_party?: string | null
          publication_name?: string | null
          quality_score?: number | null
          scheduled_publish_at?: string | null
          selected_cover_id?: string | null
          shared_content_id?: string | null
          slide_type?: string | null
          slug?: string | null
          status?: string
          title: string
          tone?: string | null
          topic_article_id?: string | null
          updated_at?: string
          writing_style?: string | null
        }
        Update: {
          animated_illustration_url?: string | null
          article_id?: string | null
          audience_expertise?: string | null
          author?: string | null
          constituency?: string | null
          cover_illustration_prompt?: string | null
          cover_illustration_url?: string | null
          created_at?: string
          drip_queued_at?: string | null
          id?: string
          illustration_generated_at?: string | null
          is_parliamentary?: boolean | null
          is_published?: boolean
          last_quality_check?: string | null
          mp_name?: string | null
          mp_party?: string | null
          publication_name?: string | null
          quality_score?: number | null
          scheduled_publish_at?: string | null
          selected_cover_id?: string | null
          shared_content_id?: string | null
          slide_type?: string | null
          slug?: string | null
          status?: string
          title?: string
          tone?: string | null
          topic_article_id?: string | null
          updated_at?: string
          writing_style?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stories_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: true
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_selected_cover_id_fkey"
            columns: ["selected_cover_id"]
            isOneToOne: false
            referencedRelation: "story_cover_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_shared_content_id_fkey"
            columns: ["shared_content_id"]
            isOneToOne: false
            referencedRelation: "shared_article_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_topic_article_id_fkey"
            columns: ["topic_article_id"]
            isOneToOne: false
            referencedRelation: "topic_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      story_cover_options: {
        Row: {
          cover_url: string
          created_at: string
          generated_at: string
          generation_prompt: string | null
          id: string
          model_used: string | null
          story_id: string
        }
        Insert: {
          cover_url: string
          created_at?: string
          generated_at?: string
          generation_prompt?: string | null
          id?: string
          model_used?: string | null
          story_id: string
        }
        Update: {
          cover_url?: string
          created_at?: string
          generated_at?: string
          generation_prompt?: string | null
          id?: string
          model_used?: string | null
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_cover_options_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_impressions: {
        Row: {
          created_at: string
          id: string
          impression_date: string
          story_id: string
          topic_id: string
          visitor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          impression_date?: string
          story_id: string
          topic_id: string
          visitor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          impression_date?: string
          story_id?: string
          topic_id?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_impressions_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_impressions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_impressions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      story_interactions: {
        Row: {
          created_at: string
          id: string
          interaction_type: string
          referrer: string | null
          share_platform: string | null
          slide_index: number | null
          story_id: string
          topic_id: string
          user_agent: string | null
          visitor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          interaction_type: string
          referrer?: string | null
          share_platform?: string | null
          slide_index?: number | null
          story_id: string
          topic_id: string
          user_agent?: string | null
          visitor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          interaction_type?: string
          referrer?: string | null
          share_platform?: string | null
          slide_index?: number | null
          story_id?: string
          topic_id?: string
          user_agent?: string | null
          visitor_id?: string
        }
        Relationships: []
      }
      story_social_content: {
        Row: {
          caption: string | null
          content_type: string
          created_at: string
          hashtags: Json
          id: string
          metadata: Json
          platform: string
          story_id: string
          updated_at: string
        }
        Insert: {
          caption?: string | null
          content_type?: string
          created_at?: string
          hashtags?: Json
          id?: string
          metadata?: Json
          platform: string
          story_id: string
          updated_at?: string
        }
        Update: {
          caption?: string | null
          content_type?: string
          created_at?: string
          hashtags?: Json
          id?: string
          metadata?: Json
          platform?: string
          story_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_social_content_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_swipes: {
        Row: {
          created_at: string
          id: string
          story_id: string
          swipe_type: string
          topic_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          story_id: string
          swipe_type: string
          topic_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          story_id?: string
          swipe_type?: string
          topic_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_swipes_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_swipes_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_swipes_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      suggested_keywords: {
        Row: {
          added_at: string | null
          created_at: string
          frequency_count: number | null
          id: string
          is_added: boolean | null
          keyword: string
          relevance_score: number | null
          suggested_at: string
          suggestion_source: string
          topic_id: string
          updated_at: string
        }
        Insert: {
          added_at?: string | null
          created_at?: string
          frequency_count?: number | null
          id?: string
          is_added?: boolean | null
          keyword: string
          relevance_score?: number | null
          suggested_at?: string
          suggestion_source?: string
          topic_id: string
          updated_at?: string
        }
        Update: {
          added_at?: string | null
          created_at?: string
          frequency_count?: number | null
          id?: string
          is_added?: boolean | null
          keyword?: string
          relevance_score?: number | null
          suggested_at?: string
          suggestion_source?: string
          topic_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          context: Json | null
          created_at: string | null
          function_name: string | null
          id: string
          level: string
          message: string
          request_id: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string | null
          function_name?: string | null
          id?: string
          level: string
          message: string
          request_id?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string | null
          function_name?: string | null
          id?: string
          level?: string
          message?: string
          request_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      topic_articles: {
        Row: {
          content_quality_score: number | null
          created_at: string
          id: string
          import_metadata: Json | null
          is_snippet: boolean | null
          keyword_matches: string[] | null
          originality_confidence: number | null
          processing_status: string
          regional_relevance_score: number | null
          shared_content_id: string
          snippet_reason: string | null
          source_id: string | null
          topic_id: string
          updated_at: string
        }
        Insert: {
          content_quality_score?: number | null
          created_at?: string
          id?: string
          import_metadata?: Json | null
          is_snippet?: boolean | null
          keyword_matches?: string[] | null
          originality_confidence?: number | null
          processing_status?: string
          regional_relevance_score?: number | null
          shared_content_id: string
          snippet_reason?: string | null
          source_id?: string | null
          topic_id: string
          updated_at?: string
        }
        Update: {
          content_quality_score?: number | null
          created_at?: string
          id?: string
          import_metadata?: Json | null
          is_snippet?: boolean | null
          keyword_matches?: string[] | null
          originality_confidence?: number | null
          processing_status?: string
          regional_relevance_score?: number | null
          shared_content_id?: string
          snippet_reason?: string | null
          source_id?: string | null
          topic_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_articles_shared_content_id_fkey"
            columns: ["shared_content_id"]
            isOneToOne: false
            referencedRelation: "shared_article_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_articles_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "content_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_articles_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "content_sources_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_articles_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_articles_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_automation_settings: {
        Row: {
          auto_illustrate_enabled: boolean | null
          auto_illustrate_in_holiday: boolean | null
          auto_simplify_enabled: boolean | null
          automation_mode: string | null
          created_at: string
          id: string
          illustration_quality_threshold: number | null
          is_active: boolean
          last_run_at: string | null
          next_run_at: string
          quality_threshold: number | null
          scrape_frequency_hours: number
          topic_id: string
          updated_at: string
        }
        Insert: {
          auto_illustrate_enabled?: boolean | null
          auto_illustrate_in_holiday?: boolean | null
          auto_simplify_enabled?: boolean | null
          automation_mode?: string | null
          created_at?: string
          id?: string
          illustration_quality_threshold?: number | null
          is_active?: boolean
          last_run_at?: string | null
          next_run_at?: string
          quality_threshold?: number | null
          scrape_frequency_hours?: number
          topic_id: string
          updated_at?: string
        }
        Update: {
          auto_illustrate_enabled?: boolean | null
          auto_illustrate_in_holiday?: boolean | null
          auto_simplify_enabled?: boolean | null
          automation_mode?: string | null
          created_at?: string
          id?: string
          illustration_quality_threshold?: number | null
          is_active?: boolean
          last_run_at?: string | null
          next_run_at?: string
          quality_threshold?: number | null
          scrape_frequency_hours?: number
          topic_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_automation_settings_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: true
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_automation_settings_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: true
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_engagement_metrics: {
        Row: {
          created_at: string
          id: string
          metric_type: string
          topic_id: string
          user_agent: string | null
          visitor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metric_type: string
          topic_id: string
          user_agent?: string | null
          visitor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metric_type?: string
          topic_id?: string
          user_agent?: string | null
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_engagement_metrics_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_engagement_metrics_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_event_preferences: {
        Row: {
          created_at: string
          event_type: string
          id: string
          is_enabled: boolean
          topic_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          is_enabled?: boolean
          topic_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          is_enabled?: boolean
          topic_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_event_preferences_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_event_preferences_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_insight_settings: {
        Row: {
          created_at: string | null
          id: string
          is_premium_tier: boolean | null
          play_mode_enabled: boolean | null
          quiz_cards_enabled: boolean | null
          sift_enabled: boolean | null
          social_proof_enabled: boolean | null
          story_momentum_enabled: boolean | null
          this_time_last_month_enabled: boolean | null
          topic_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_premium_tier?: boolean | null
          play_mode_enabled?: boolean | null
          quiz_cards_enabled?: boolean | null
          sift_enabled?: boolean | null
          social_proof_enabled?: boolean | null
          story_momentum_enabled?: boolean | null
          this_time_last_month_enabled?: boolean | null
          topic_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_premium_tier?: boolean | null
          play_mode_enabled?: boolean | null
          quiz_cards_enabled?: boolean | null
          sift_enabled?: boolean | null
          social_proof_enabled?: boolean | null
          story_momentum_enabled?: boolean | null
          this_time_last_month_enabled?: boolean | null
          topic_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topic_insight_settings_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: true
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_insight_settings_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: true
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_memberships: {
        Row: {
          created_at: string | null
          id: string
          role: string
          topic_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: string
          topic_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string
          topic_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_memberships_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_memberships_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_newsletter_signups: {
        Row: {
          created_at: string
          email: string | null
          frequency: string
          id: string
          is_active: boolean
          name: string | null
          notification_type: string | null
          push_subscription: Json | null
          topic_id: string | null
          updated_at: string
          verification_token: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          name?: string | null
          notification_type?: string | null
          push_subscription?: Json | null
          topic_id?: string | null
          updated_at?: string
          verification_token?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          name?: string | null
          notification_type?: string | null
          push_subscription?: Json | null
          topic_id?: string | null
          updated_at?: string
          verification_token?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topic_newsletter_signups_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_newsletter_signups_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_roundups: {
        Row: {
          created_at: string
          id: string
          is_published: boolean
          period_end: string
          period_start: string
          roundup_type: string
          slide_data: Json
          stats: Json
          story_ids: string[]
          topic_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_published?: boolean
          period_end: string
          period_start: string
          roundup_type: string
          slide_data?: Json
          stats?: Json
          story_ids?: string[]
          topic_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_published?: boolean
          period_end?: string
          period_start?: string
          roundup_type?: string
          slide_data?: Json
          stats?: Json
          story_ids?: string[]
          topic_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_roundups_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_roundups_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_sentiment_settings: {
        Row: {
          analysis_frequency_hours: number | null
          comparison_cards_enabled: boolean | null
          created_at: string | null
          enabled: boolean | null
          excluded_keywords: string[] | null
          id: string
          keyword_cards_enabled: boolean | null
          last_analysis_at: string | null
          topic_id: string | null
          updated_at: string | null
        }
        Insert: {
          analysis_frequency_hours?: number | null
          comparison_cards_enabled?: boolean | null
          created_at?: string | null
          enabled?: boolean | null
          excluded_keywords?: string[] | null
          id?: string
          keyword_cards_enabled?: boolean | null
          last_analysis_at?: string | null
          topic_id?: string | null
          updated_at?: string | null
        }
        Update: {
          analysis_frequency_hours?: number | null
          comparison_cards_enabled?: boolean | null
          created_at?: string | null
          enabled?: boolean | null
          excluded_keywords?: string[] | null
          id?: string
          keyword_cards_enabled?: boolean | null
          last_analysis_at?: string | null
          topic_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topic_sentiment_settings_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: true
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_sentiment_settings_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: true
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_sources: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          source_config: Json | null
          source_id: string
          topic_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          source_config?: Json | null
          source_id: string
          topic_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          source_config?: Json | null
          source_id?: string
          topic_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "content_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "content_sources_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_sources_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_sources_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_tracked_mps: {
        Row: {
          constituency: string
          created_at: string | null
          detection_confidence:
            | Database["public"]["Enums"]["mp_detection_confidence"]
            | null
          id: string
          is_auto_detected: boolean | null
          is_primary: boolean | null
          mp_id: number
          mp_name: string
          mp_party: string
          topic_id: string
          tracking_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          constituency: string
          created_at?: string | null
          detection_confidence?:
            | Database["public"]["Enums"]["mp_detection_confidence"]
            | null
          id?: string
          is_auto_detected?: boolean | null
          is_primary?: boolean | null
          mp_id: number
          mp_name: string
          mp_party: string
          topic_id: string
          tracking_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          constituency?: string
          created_at?: string | null
          detection_confidence?:
            | Database["public"]["Enums"]["mp_detection_confidence"]
            | null
          id?: string
          is_auto_detected?: boolean | null
          is_primary?: boolean | null
          mp_id?: number
          mp_name?: string
          mp_party?: string
          topic_id?: string
          tracking_enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topic_tracked_mps_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_tracked_mps_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          audience_expertise:
            | Database["public"]["Enums"]["audience_expertise"]
            | null
          auto_simplify_enabled: boolean | null
          automated_insights_enabled: boolean | null
          automation_quality_threshold: number | null
          branding_config: Json | null
          community_config: Json | null
          community_intelligence_enabled: boolean | null
          community_pulse_frequency: number | null
          competing_regions: string[] | null
          created_at: string | null
          created_by: string
          custom_css: Json | null
          default_tone: Database["public"]["Enums"]["tone_type"] | null
          default_writing_style: string | null
          description: string | null
          donation_config: Json | null
          donation_enabled: boolean | null
          drip_end_hour: number | null
          drip_feed_enabled: boolean | null
          drip_release_interval_hours: number | null
          drip_start_hour: number | null
          drip_stories_per_release: number | null
          events_enabled: boolean | null
          id: string
          illustration_accent_color: string | null
          illustration_primary_color: string | null
          illustration_style: Database["public"]["Enums"]["illustration_style_enum"]
          is_active: boolean | null
          is_archived: boolean | null
          is_public: boolean | null
          keywords: string[] | null
          landmarks: string[] | null
          max_article_age_days: number | null
          name: string
          negative_keywords: string[] | null
          organizations: string[] | null
          parliamentary_last_collection_at: string | null
          parliamentary_last_weekly_roundup_at: string | null
          parliamentary_tracking_enabled: boolean | null
          postcodes: string[] | null
          region: string | null
          slug: string | null
          topic_type: string
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          audience_expertise?:
            | Database["public"]["Enums"]["audience_expertise"]
            | null
          auto_simplify_enabled?: boolean | null
          automated_insights_enabled?: boolean | null
          automation_quality_threshold?: number | null
          branding_config?: Json | null
          community_config?: Json | null
          community_intelligence_enabled?: boolean | null
          community_pulse_frequency?: number | null
          competing_regions?: string[] | null
          created_at?: string | null
          created_by: string
          custom_css?: Json | null
          default_tone?: Database["public"]["Enums"]["tone_type"] | null
          default_writing_style?: string | null
          description?: string | null
          donation_config?: Json | null
          donation_enabled?: boolean | null
          drip_end_hour?: number | null
          drip_feed_enabled?: boolean | null
          drip_release_interval_hours?: number | null
          drip_start_hour?: number | null
          drip_stories_per_release?: number | null
          events_enabled?: boolean | null
          id?: string
          illustration_accent_color?: string | null
          illustration_primary_color?: string | null
          illustration_style?: Database["public"]["Enums"]["illustration_style_enum"]
          is_active?: boolean | null
          is_archived?: boolean | null
          is_public?: boolean | null
          keywords?: string[] | null
          landmarks?: string[] | null
          max_article_age_days?: number | null
          name: string
          negative_keywords?: string[] | null
          organizations?: string[] | null
          parliamentary_last_collection_at?: string | null
          parliamentary_last_weekly_roundup_at?: string | null
          parliamentary_tracking_enabled?: boolean | null
          postcodes?: string[] | null
          region?: string | null
          slug?: string | null
          topic_type?: string
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          audience_expertise?:
            | Database["public"]["Enums"]["audience_expertise"]
            | null
          auto_simplify_enabled?: boolean | null
          automated_insights_enabled?: boolean | null
          automation_quality_threshold?: number | null
          branding_config?: Json | null
          community_config?: Json | null
          community_intelligence_enabled?: boolean | null
          community_pulse_frequency?: number | null
          competing_regions?: string[] | null
          created_at?: string | null
          created_by?: string
          custom_css?: Json | null
          default_tone?: Database["public"]["Enums"]["tone_type"] | null
          default_writing_style?: string | null
          description?: string | null
          donation_config?: Json | null
          donation_enabled?: boolean | null
          drip_end_hour?: number | null
          drip_feed_enabled?: boolean | null
          drip_release_interval_hours?: number | null
          drip_start_hour?: number | null
          drip_stories_per_release?: number | null
          events_enabled?: boolean | null
          id?: string
          illustration_accent_color?: string | null
          illustration_primary_color?: string | null
          illustration_style?: Database["public"]["Enums"]["illustration_style_enum"]
          is_active?: boolean | null
          is_archived?: boolean | null
          is_public?: boolean | null
          keywords?: string[] | null
          landmarks?: string[] | null
          max_article_age_days?: number | null
          name?: string
          negative_keywords?: string[] | null
          organizations?: string[] | null
          parliamentary_last_collection_at?: string | null
          parliamentary_last_weekly_roundup_at?: string | null
          parliamentary_tracking_enabled?: boolean | null
          postcodes?: string[] | null
          region?: string | null
          slug?: string | null
          topic_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          created_at: string
          credits_balance: number
          id: string
          total_credits_purchased: number
          total_credits_used: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_balance?: number
          id?: string
          total_credits_purchased?: number
          total_credits_used?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_balance?: number
          id?: string
          total_credits_purchased?: number
          total_credits_used?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_regions: {
        Row: {
          created_at: string
          id: string
          region: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          region: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          region?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      visuals: {
        Row: {
          alt_text: string | null
          created_at: string
          generation_prompt: string | null
          id: string
          image_data: string | null
          image_url: string | null
          slide_id: string
          style_preset: string | null
          updated_at: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          generation_prompt?: string | null
          id?: string
          image_data?: string | null
          image_url?: string | null
          slide_id: string
          style_preset?: string | null
          updated_at?: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          generation_prompt?: string | null
          id?: string
          image_data?: string | null
          image_url?: string | null
          slide_id?: string
          style_preset?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visuals_slide_id_fkey"
            columns: ["slide_id"]
            isOneToOne: false
            referencedRelation: "slides"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
          plan: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          plan?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          plan?: string | null
        }
        Relationships: []
      }
      weekly_digest_history: {
        Row: {
          created_at: string | null
          delivery_method: string | null
          failure_count: number | null
          id: string
          metadata: Json | null
          recipient_count: number
          sent_at: string
          stories_included: Json
          success_count: number | null
          topic_id: string
        }
        Insert: {
          created_at?: string | null
          delivery_method?: string | null
          failure_count?: number | null
          id?: string
          metadata?: Json | null
          recipient_count: number
          sent_at?: string
          stories_included: Json
          success_count?: number | null
          topic_id: string
        }
        Update: {
          created_at?: string | null
          delivery_method?: string | null
          failure_count?: number | null
          id?: string
          metadata?: Json | null
          recipient_count?: number
          sent_at?: string
          stories_included?: Json
          success_count?: number | null
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_digest_history_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "safe_public_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_digest_history_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      content_sources_basic: {
        Row: {
          articles_scraped: number | null
          canonical_domain: string | null
          content_type: string | null
          created_at: string | null
          credibility_score: number | null
          id: string | null
          is_active: boolean | null
          is_blacklisted: boolean | null
          is_whitelisted: boolean | null
          last_scraped_at: string | null
          region: string | null
          source_name: string | null
          source_type: string | null
          updated_at: string | null
        }
        Insert: {
          articles_scraped?: number | null
          canonical_domain?: string | null
          content_type?: string | null
          created_at?: string | null
          credibility_score?: number | null
          id?: string | null
          is_active?: boolean | null
          is_blacklisted?: boolean | null
          is_whitelisted?: boolean | null
          last_scraped_at?: string | null
          region?: string | null
          source_name?: string | null
          source_type?: string | null
          updated_at?: string | null
        }
        Update: {
          articles_scraped?: number | null
          canonical_domain?: string | null
          content_type?: string | null
          created_at?: string | null
          credibility_score?: number | null
          id?: string | null
          is_active?: boolean | null
          is_blacklisted?: boolean | null
          is_whitelisted?: boolean | null
          last_scraped_at?: string | null
          region?: string | null
          source_name?: string | null
          source_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      safe_public_topics: {
        Row: {
          created_at: string | null
          description: string | null
          id: string | null
          is_active: boolean | null
          is_public: boolean | null
          name: string | null
          region: string | null
          slug: string | null
          topic_type: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          is_public?: boolean | null
          name?: string | null
          region?: string | null
          slug?: string | null
          topic_type?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          is_public?: boolean | null
          name?: string | null
          region?: string | null
          slug?: string | null
          topic_type?: string | null
        }
        Relationships: []
      }
      user_credits_summary: {
        Row: {
          credits_balance: number | null
          total_credits_purchased: number | null
          total_credits_used: number | null
          transactions_last_30_days: number | null
          updated_at: string | null
          usage_last_30_days: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_source_to_topic: {
        Args: {
          p_source_config?: Json
          p_source_id: string
          p_topic_id: string
        }
        Returns: boolean
      }
      add_user_credits: {
        Args: {
          p_credits_amount: number
          p_description?: string
          p_transaction_type?: string
          p_user_id: string
        }
        Returns: Json
      }
      approve_article_for_generation: {
        Args: { article_uuid: string }
        Returns: boolean
      }
      article_is_public: { Args: { p_article_id: string }; Returns: boolean }
      auto_generate_missing_schedules: { Args: never; Returns: Json }
      bulk_cleanup_topic_content: {
        Args: { p_topic_id: string }
        Returns: Json
      }
      bulk_cleanup_user_topics: {
        Args: { p_action?: string; p_user_id: string }
        Returns: Json
      }
      bulk_delete_discarded_articles: {
        Args: { p_topic_id?: string }
        Returns: Json
      }
      bulk_delete_pending_articles: {
        Args: { p_topic_id?: string }
        Returns: Json
      }
      can_access_newsletter_signups: {
        Args: { p_topic_id: string }
        Returns: boolean
      }
      check_newsletter_signup_rate_limit: {
        Args: { p_email: string; p_ip_hash?: string }
        Returns: boolean
      }
      cleanup_diane_abbott_stories_eastbourne: { Args: never; Returns: Json }
      cleanup_duplicate_articles: { Args: never; Returns: Json }
      cleanup_existing_duplicates: { Args: never; Returns: Json }
      cleanup_expired_community_insights: { Args: never; Returns: undefined }
      cleanup_old_rate_limits: { Args: never; Returns: undefined }
      cleanup_old_scraped_urls: { Args: never; Returns: undefined }
      cleanup_old_system_logs: { Args: never; Returns: undefined }
      cleanup_orphaned_legacy_sources: { Args: never; Returns: Json }
      cleanup_orphaned_sources: { Args: never; Returns: Json }
      cleanup_parliamentary_stories_for_topic: {
        Args: { p_topic_id: string }
        Returns: Json
      }
      cleanup_stuck_scrape_jobs: { Args: never; Returns: number }
      create_story_from_multi_tenant: {
        Args: {
          p_shared_content_id: string
          p_status?: string
          p_title: string
          p_topic_article_id: string
        }
        Returns: string
      }
      deduct_user_credits: {
        Args: {
          p_credits_amount: number
          p_description?: string
          p_story_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      delete_event_with_backfill: {
        Args: { event_id_param: string }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      delete_story_cascade: { Args: { p_story_id: string }; Returns: Json }
      delete_topic_cascade: { Args: { p_topic_id: string }; Returns: Json }
      detect_article_duplicates:
        | {
            Args: { p_article_id: string }
            Returns: {
              detection_method: string
              duplicate_id: string
              similarity_score: number
            }[]
          }
        | {
            Args: { p_article_id: string; p_topic_id?: string }
            Returns: {
              detection_method: string
              duplicate_id: string
              similarity_score: number
            }[]
          }
      emergency_manual_scrape: { Args: { p_topic_id?: string }; Returns: Json }
      find_duplicate_articles: {
        Args: { p_article_id: string; p_similarity_threshold?: number }
        Returns: {
          detection_method: string
          duplicate_id: string
          similarity_score: number
        }[]
      }
      fix_sussex_express_sources: { Args: never; Returns: Json }
      generate_story_slug: {
        Args: { story_id: string; title_text: string }
        Returns: string
      }
      get_admin_topic_stories: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_status?: string
          p_topic_id: string
        }
        Returns: {
          animated_illustration_url: string
          article_author: string
          article_id: string
          article_published_at: string
          article_title: string
          article_url: string
          audience_expertise: string
          cover_illustration_prompt: string
          cover_illustration_url: string
          created_at: string
          id: string
          illustration_generated_at: string
          is_published: boolean
          scheduled_publish_at: string
          shared_content_id: string
          slide_count: number
          slide_type: string
          status: string
          story_type: string
          title: string
          tone: string
          topic_article_id: string
          updated_at: string
          writing_style: string
        }[]
      }
      get_article_content_unified: {
        Args: {
          p_article_id?: string
          p_shared_content_id?: string
          p_topic_article_id?: string
        }
        Returns: {
          author: string
          body: string
          canonical_url: string
          content_quality_score: number
          id: string
          image_url: string
          processing_status: string
          published_at: string
          regional_relevance_score: number
          source_type: string
          source_url: string
          title: string
          word_count: number
        }[]
      }
      get_content_sources_count: { Args: never; Returns: number }
      get_current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_daily_story_counts: {
        Args: { p_days?: number; p_topic_id: string }
        Returns: {
          date: string
          story_count: number
        }[]
      }
      get_legacy_articles_awaiting_simplification: {
        Args: { p_topic_id: string }
        Returns: number
      }
      get_multitenant_articles_awaiting_simplification: {
        Args: { p_topic_id: string }
        Returns: number
      }
      get_popular_stories_by_period: {
        Args: { p_topic_id: string }
        Returns: {
          period_type: string
          rank_position: number
          story_id: string
          swipe_count: number
        }[]
      }
      get_public_slides_for_stories: {
        Args: { p_story_ids: string[] }
        Returns: {
          content: string
          id: string
          slide_number: number
          story_id: string
          word_count: number
        }[]
      }
      get_public_story_by_slug_and_id: {
        Args: { p_slug: string; p_story_id: string }
        Returns: Json
      }
      get_public_topic_feed: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_sort_by?: string
          topic_slug_param: string
        }
        Returns: {
          article_author: string
          article_published_at: string
          article_title: string
          article_url: string
          slide_alt_text: string
          slide_content: string
          slide_id: string
          slide_number: number
          slide_word_count: number
          source_canonical_domain: string
          source_name: string
          story_cover_illustration_url: string
          story_created_at: string
          story_id: string
          story_slug: string
          story_status: string
          story_title: string
          story_tone: string
          story_updated_at: string
          topic_article_id: string
        }[]
      }
      get_published_stories_for_sitemap: {
        Args: never
        Returns: {
          story_id: string
          title: string
          topic_slug: string
          updated_at: string
        }[]
      }
      get_queue_items_unified: {
        Args: { p_topic_id?: string }
        Returns: {
          ai_provider: string
          article_id: string
          created_at: string
          id: string
          shared_content_id: string
          slidetype: string
          source_type: string
          status: string
          title: string
          tone: Database["public"]["Enums"]["tone_type"]
          topic_article_id: string
          writing_style: string
        }[]
      }
      get_safe_public_topic_info: {
        Args: never
        Returns: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          is_public: boolean
          name: string
          region: string
          slug: string
          topic_type: string
        }[]
      }
      get_safe_public_topics: {
        Args: never
        Returns: {
          created_at: string
          description: string
          id: string
          name: string
          region: string
          slug: string
          topic_type: string
        }[]
      }
      get_source_health_stats: {
        Args: { p_topic_id: string }
        Returns: {
          articles_last_7_days: number
          consecutive_failures: number
          last_success_at: string
          source_id: string
          source_name: string
          success_rate: number
        }[]
      }
      get_source_topics: {
        Args: { p_source_id: string }
        Returns: {
          is_active: boolean
          region: string
          source_config: Json
          topic_id: string
          topic_name: string
          topic_type: string
        }[]
      }
      get_stories_unified:
        | {
            Args: { p_topic_id?: string }
            Returns: {
              article_id: string
              audience_expertise: string
              author: string
              cover_illustration_prompt: string
              cover_illustration_url: string
              created_at: string
              id: string
              illustration_generated_at: string
              is_published: boolean
              shared_content_id: string
              slides: Json
              slides_count: number
              slidetype: string
              source_type: string
              source_url: string
              status: string
              title: string
              tone: string
              topic_article_id: string
              updated_at: string
              word_count: number
              writing_style: string
            }[]
          }
        | {
            Args: {
              p_limit?: number
              p_offset?: number
              p_status?: string
              p_topic_id: string
            }
            Returns: {
              article_id: string
              author: string
              cover_illustration_prompt: string
              cover_illustration_url: string
              created_at: string
              id: string
              is_published: boolean
              publication_name: string
              quality_score: number
              shared_content_id: string
              slides: Json
              source_url: string
              status: string
              title: string
              topic_article_id: string
              updated_at: string
              word_count: number
            }[]
          }
      get_story_swipe_stats: {
        Args: { p_story_id: string }
        Returns: {
          discard_count: number
          like_count: number
          total_count: number
        }[]
      }
      get_swipe_insights: {
        Args: { p_topic_id: string }
        Returns: {
          approval_rate: number
          bottom_stories: Json
          top_stories: Json
          total_discards: number
          total_likes: number
          total_readers: number
        }[]
      }
      get_topic_articles_multi_tenant: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_status?: string
          p_topic_id: string
        }
        Returns: {
          author: string
          body: string
          canonical_url: string
          content_checksum: string
          content_quality_score: number
          created_at: string
          id: string
          image_url: string
          import_metadata: Json
          keyword_matches: string[]
          language: string
          last_seen_at: string
          normalized_url: string
          originality_confidence: number
          processing_status: string
          published_at: string
          regional_relevance_score: number
          shared_content_id: string
          source_domain: string
          source_id: string
          title: string
          topic_id: string
          updated_at: string
          url: string
          word_count: number
        }[]
      }
      get_topic_engagement_averages: {
        Args: { p_days?: number; p_topic_id: string }
        Returns: {
          avg_carousel_swipes: number
          avg_final_slides_seen: number
          avg_stories_engaged: number
          play_mode_visitors_week: number
          total_completed: number
          total_source_clicks: number
          total_stories_engaged: number
          total_visitors: number
        }[]
      }
      get_topic_engagement_funnel: {
        Args: { p_days?: number; p_topic_id: string }
        Returns: {
          completed: number
          engaged: number
          shared: number
          source_clicks: number
          visitors: number
        }[]
      }
      get_topic_engagement_stats: {
        Args: { p_topic_id: string }
        Returns: {
          notifications_enabled: number
          pwa_installs: number
        }[]
      }
      get_topic_events: {
        Args: { topic_id_param: string }
        Returns: {
          category: string
          description: string
          end_date: string
          end_time: string
          event_type: string
          id: string
          location: string
          price: string
          rank_position: number
          source_name: string
          source_url: string
          start_date: string
          start_time: string
          title: string
        }[]
      }
      get_topic_filter_options: {
        Args: { p_topic_slug: string }
        Returns: {
          count: number
          filter_type: string
          filter_value: string
        }[]
      }
      get_topic_install_stats: {
        Args: { p_topic_id: string }
        Returns: {
          installs_this_week: number
          installs_total: number
        }[]
      }
      get_topic_interaction_stats: {
        Args: { p_days?: number; p_topic_id: string }
        Returns: {
          articles_swiped: number
          share_clicks: number
          total_swipes: number
        }[]
      }
      get_topic_quiz_stats: {
        Args: { p_days?: number; p_topic_id: string }
        Returns: {
          correct_rate: number
          quiz_responses_count: number
        }[]
      }
      get_topic_registrant_stats: {
        Args: { p_topic_id: string }
        Returns: {
          registrants_this_week: number
          registrants_total: number
        }[]
      }
      get_topic_source_stats: {
        Args: { p_topic_id: string }
        Returns: {
          canonical_domain: string
          feed_url: string
          is_active: boolean
          is_gathering: boolean
          last_story_date: string
          source_id: string
          source_name: string
          stories_published_7d: number
          stories_published_total: number
        }[]
      }
      get_topic_sources: {
        Args: { p_topic_id: string }
        Returns: {
          articles_scraped: number
          canonical_domain: string
          consecutive_failures: number
          credibility_score: number
          feed_url: string
          is_active: boolean
          last_failure_reason: string
          last_scraped_at: string
          scrape_frequency_hours: number
          scraping_method: string
          source_config: Json
          source_id: string
          source_name: string
          source_type: string
          success_rate: number
        }[]
      }
      get_topic_stories: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_sort_by?: string
          p_topic_slug: string
        }
        Returns: {
          article_author: string
          article_id: string
          article_published_at: string
          article_title: string
          author: string
          created_at: string
          id: string
          slides: Json
          story_type: string
          title: string
          updated_at: string
        }[]
      }
      get_topic_stories_with_keywords: {
        Args: {
          p_keyword_filters?: string[]
          p_limit?: number
          p_offset?: number
          p_source_filters?: string[]
          p_topic_id: string
        }
        Returns: {
          article_author: string
          article_published_at: string
          article_source_id: string
          article_source_url: string
          article_title: string
          matched_keywords: string[]
          shared_content_id: string
          slide_alt_text: string
          slide_content: string
          slide_id: string
          slide_number: number
          slide_word_count: number
          source_canonical_domain: string
          source_name: string
          story_animated_illustration_url: string
          story_audience_expertise: string
          story_cover_illustration_url: string
          story_created_at: string
          story_id: string
          story_is_published: boolean
          story_slug: string
          story_status: string
          story_title: string
          story_tone: string
          story_updated_at: string
          story_writing_style: string
          topic_article_id: string
        }[]
      }
      get_topic_visitor_breakdown: {
        Args: { p_days?: number; p_topic_id: string }
        Returns: {
          return_rate_pct: number
          today_new: number
          today_returning: number
          total_unique: number
          week_new: number
          week_returning: number
        }[]
      }
      get_topic_visitor_stats: {
        Args: { p_topic_id: string }
        Returns: {
          play_mode_visits_week: number
          visits_this_week: number
          visits_today: number
        }[]
      }
      get_user_dashboard_stats: {
        Args: { p_user_id: string }
        Returns: {
          articles_disliked: number
          articles_in_arrivals: number
          articles_liked: number
          avg_carousel_swipes: number
          avg_final_slides_seen: number
          avg_stories_engaged: number
          installs_this_week: number
          installs_total: number
          play_mode_visits_week: number
          quiz_responses_count: number
          registrants_this_week: number
          registrants_total: number
          share_clicks: number
          source_clicks: number
          stories_published_week: number
          topic_id: string
          visits_this_week: number
          visits_today: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_feature_enabled: { Args: { flag_name: string }; Returns: boolean }
      is_story_published: { Args: { p_story_id: string }; Returns: boolean }
      is_story_visible: { Args: { story_updated_at: string }; Returns: boolean }
      log_drip_feed_event: {
        Args: {
          p_details?: Json
          p_event_type: string
          p_story_id?: string
          p_topic_id: string
        }
        Returns: undefined
      }
      log_error_ticket: {
        Args: {
          p_context_data?: Json
          p_error_code?: string
          p_error_details: string
          p_severity?: string
          p_source_info: Json
          p_stack_trace?: string
          p_ticket_type: string
        }
        Returns: string
      }
      log_event: {
        Args: {
          p_context?: Json
          p_function_name?: string
          p_level: string
          p_message: string
        }
        Returns: string
      }
      migrate_articles_to_multi_tenant: {
        Args: { p_limit?: number }
        Returns: Json
      }
      normalize_url: { Args: { input_url: string }; Returns: string }
      normalize_url_enhanced: { Args: { input_url: string }; Returns: string }
      populate_topic_sources_from_existing: { Args: never; Returns: number }
      queue_multi_tenant_article:
        | {
            Args: {
              p_ai_provider?: string
              p_shared_content_id: string
              p_slidetype?: string
              p_tone?: Database["public"]["Enums"]["tone_type"]
              p_writing_style?: string
            }
            Returns: string
          }
        | {
            Args: {
              p_ai_provider?: string
              p_shared_content_id: string
              p_slidetype?: string
              p_tone?: Database["public"]["Enums"]["tone_type"]
              p_topic_article_id: string
              p_writing_style?: string
            }
            Returns: string
          }
      record_feed_visit: {
        Args: {
          p_page_type?: string
          p_referrer?: string
          p_topic_id: string
          p_user_agent?: string
          p_visitor_id: string
        }
        Returns: undefined
      }
      record_newsletter_signup_attempt: {
        Args: { p_email: string; p_ip_hash?: string }
        Returns: undefined
      }
      record_story_interaction: {
        Args: {
          p_interaction_type: string
          p_referrer?: string
          p_share_platform?: string
          p_slide_index?: number
          p_story_id: string
          p_topic_id: string
          p_user_agent?: string
          p_visitor_id: string
        }
        Returns: undefined
      }
      remove_source_from_topic: {
        Args: { p_source_id: string; p_topic_id: string }
        Returns: boolean
      }
      rescore_articles_for_topic: {
        Args: { p_topic_id: string }
        Returns: undefined
      }
      reset_stalled_processing: { Args: never; Returns: undefined }
      reset_stalled_stories: { Args: never; Returns: number }
      safe_cleanup_inactive_sources: {
        Args: never
        Returns: {
          deleted_count: number
          message: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      snapshot_sentiment_keywords: { Args: never; Returns: undefined }
      test_rss_import: { Args: { p_source_name?: string }; Returns: Json }
      test_search_functionality: {
        Args: { p_search_term?: string }
        Returns: {
          article_id: string
          relevance_score: number
          title: string
        }[]
      }
      update_cron_schedules: { Args: never; Returns: undefined }
      update_scheduler_setting: {
        Args: { p_setting_key: string; p_setting_value: Json }
        Returns: boolean
      }
      update_source_health_metrics: {
        Args: {
          p_error_message?: string
          p_response_time_ms?: number
          p_source_id: string
          p_success: boolean
        }
        Returns: undefined
      }
      user_has_region_access: {
        Args: { check_region: string }
        Returns: boolean
      }
      user_has_topic_access: {
        Args: { p_required_role?: string; p_topic_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "superadmin"
      audience_expertise: "beginner" | "intermediate" | "expert"
      illustration_style_enum:
        | "editorial_illustrative"
        | "editorial_photographic"
      mp_detection_confidence: "high" | "medium" | "low"
      tone_type: "formal" | "conversational" | "engaging" | "satirical"
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
    Enums: {
      app_role: ["admin", "user", "superadmin"],
      audience_expertise: ["beginner", "intermediate", "expert"],
      illustration_style_enum: [
        "editorial_illustrative",
        "editorial_photographic",
      ],
      mp_detection_confidence: ["high", "medium", "low"],
      tone_type: ["formal", "conversational", "engaging", "satirical"],
    },
  },
} as const
