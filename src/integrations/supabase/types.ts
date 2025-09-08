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
    PostgrestVersion: "13.0.4"
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
          search: unknown | null
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
          search?: unknown | null
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
          search?: unknown | null
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
          slidetype: string
          started_at: string | null
          status: string
          tone: Database["public"]["Enums"]["tone_type"] | null
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
          slidetype?: string
          started_at?: string | null
          status?: string
          tone?: Database["public"]["Enums"]["tone_type"] | null
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
          slidetype?: string
          started_at?: string | null
          status?: string
          tone?: Database["public"]["Enums"]["tone_type"] | null
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
        ]
      }
      content_sources: {
        Row: {
          articles_scraped: number | null
          avg_response_time_ms: number | null
          canonical_domain: string | null
          content_type: string | null
          created_at: string | null
          credibility_score: number | null
          feed_url: string | null
          id: string
          is_active: boolean | null
          is_blacklisted: boolean | null
          is_whitelisted: boolean | null
          last_scraped_at: string | null
          region: string | null
          scrape_frequency_hours: number | null
          scraping_config: Json | null
          scraping_method: string | null
          source_name: string
          source_type: string | null
          success_rate: number | null
          topic_id: string | null
          updated_at: string | null
        }
        Insert: {
          articles_scraped?: number | null
          avg_response_time_ms?: number | null
          canonical_domain?: string | null
          content_type?: string | null
          created_at?: string | null
          credibility_score?: number | null
          feed_url?: string | null
          id?: string
          is_active?: boolean | null
          is_blacklisted?: boolean | null
          is_whitelisted?: boolean | null
          last_scraped_at?: string | null
          region?: string | null
          scrape_frequency_hours?: number | null
          scraping_config?: Json | null
          scraping_method?: string | null
          source_name: string
          source_type?: string | null
          success_rate?: number | null
          topic_id?: string | null
          updated_at?: string | null
        }
        Update: {
          articles_scraped?: number | null
          avg_response_time_ms?: number | null
          canonical_domain?: string | null
          content_type?: string | null
          created_at?: string | null
          credibility_score?: number | null
          feed_url?: string | null
          id?: string
          is_active?: boolean | null
          is_blacklisted?: boolean | null
          is_whitelisted?: boolean | null
          last_scraped_at?: string | null
          region?: string | null
          scrape_frequency_hours?: number | null
          scraping_config?: Json | null
          scraping_method?: string | null
          source_name?: string
          source_type?: string | null
          success_rate?: number | null
          topic_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
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
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
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
      newsletter_signup_rate_limits: {
        Row: {
          created_at: string | null
          email_hash: string
          id: string
          ip_hash: string
          signup_count: number | null
          updated_at: string | null
          window_duration: unknown | null
          window_start: string | null
        }
        Insert: {
          created_at?: string | null
          email_hash: string
          id?: string
          ip_hash: string
          signup_count?: number | null
          updated_at?: string | null
          window_duration?: unknown | null
          window_start?: string | null
        }
        Update: {
          created_at?: string | null
          email_hash?: string
          id?: string
          ip_hash?: string
          signup_count?: number | null
          updated_at?: string | null
          window_duration?: unknown | null
          window_start?: string | null
        }
        Relationships: []
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
          card_type: string | null
          card_version: number | null
          confidence_score: number | null
          content: Json
          content_fingerprint: string | null
          created_at: string | null
          display_count: number | null
          id: string
          is_published: boolean | null
          is_visible: boolean | null
          keyword_phrase: string
          last_shown_at: string | null
          needs_review: boolean | null
          previous_sentiment_score: number | null
          sentiment_score: number | null
          slides: Json | null
          sources: Json
          topic_id: string | null
          update_reason: string | null
          updated_at: string | null
        }
        Insert: {
          analysis_date?: string
          card_type?: string | null
          card_version?: number | null
          confidence_score?: number | null
          content?: Json
          content_fingerprint?: string | null
          created_at?: string | null
          display_count?: number | null
          id?: string
          is_published?: boolean | null
          is_visible?: boolean | null
          keyword_phrase: string
          last_shown_at?: string | null
          needs_review?: boolean | null
          previous_sentiment_score?: number | null
          sentiment_score?: number | null
          slides?: Json | null
          sources?: Json
          topic_id?: string | null
          update_reason?: string | null
          updated_at?: string | null
        }
        Update: {
          analysis_date?: string
          card_type?: string | null
          card_version?: number | null
          confidence_score?: number | null
          content?: Json
          content_fingerprint?: string | null
          created_at?: string | null
          display_count?: number | null
          id?: string
          is_published?: boolean | null
          is_visible?: boolean | null
          keyword_phrase?: string
          last_shown_at?: string | null
          needs_review?: boolean | null
          previous_sentiment_score?: number | null
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
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      slides: {
        Row: {
          alt_text: string | null
          content: string
          created_at: string
          id: string
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
      stories: {
        Row: {
          article_id: string
          author: string | null
          cover_illustration_prompt: string | null
          cover_illustration_url: string | null
          created_at: string
          id: string
          illustration_generated_at: string | null
          is_published: boolean
          last_quality_check: string | null
          publication_name: string | null
          quality_score: number | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          article_id: string
          author?: string | null
          cover_illustration_prompt?: string | null
          cover_illustration_url?: string | null
          created_at?: string
          id?: string
          illustration_generated_at?: string | null
          is_published?: boolean
          last_quality_check?: string | null
          publication_name?: string | null
          quality_score?: number | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          article_id?: string
          author?: string | null
          cover_illustration_prompt?: string | null
          cover_illustration_url?: string | null
          created_at?: string
          id?: string
          illustration_generated_at?: string | null
          is_published?: boolean
          last_quality_check?: string | null
          publication_name?: string | null
          quality_score?: number | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: true
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
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
      topic_automation_settings: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          last_run_at: string | null
          next_run_at: string
          scrape_frequency_hours: number
          topic_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          next_run_at?: string
          scrape_frequency_hours?: number
          topic_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          next_run_at?: string
          scrape_frequency_hours?: number
          topic_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_automation_settings_topic_id_fkey"
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
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_newsletter_signups: {
        Row: {
          created_at: string
          email: string
          email_verified: boolean | null
          id: string
          name: string | null
          topic_id: string
          verification_sent_at: string | null
          verification_token: string | null
        }
        Insert: {
          created_at?: string
          email: string
          email_verified?: boolean | null
          id?: string
          name?: string | null
          topic_id: string
          verification_sent_at?: string | null
          verification_token?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          email_verified?: boolean | null
          id?: string
          name?: string | null
          topic_id?: string
          verification_sent_at?: string | null
          verification_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topic_newsletter_signups_topic_id_fkey"
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
          created_at: string | null
          enabled: boolean | null
          excluded_keywords: string[] | null
          id: string
          last_analysis_at: string | null
          topic_id: string | null
          updated_at: string | null
        }
        Insert: {
          analysis_frequency_hours?: number | null
          created_at?: string | null
          enabled?: boolean | null
          excluded_keywords?: string[] | null
          id?: string
          last_analysis_at?: string | null
          topic_id?: string | null
          updated_at?: string | null
        }
        Update: {
          analysis_frequency_hours?: number | null
          created_at?: string | null
          enabled?: boolean | null
          excluded_keywords?: string[] | null
          id?: string
          last_analysis_at?: string | null
          topic_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topic_sentiment_settings_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: true
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          audience_expertise:
            | Database["public"]["Enums"]["audience_expertise"]
            | null
          branding_config: Json | null
          competing_regions: string[] | null
          created_at: string | null
          created_by: string
          custom_css: Json | null
          default_tone: Database["public"]["Enums"]["tone_type"] | null
          default_writing_style: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_public: boolean | null
          keywords: string[] | null
          landmarks: string[] | null
          name: string
          negative_keywords: string[] | null
          organizations: string[] | null
          postcodes: string[] | null
          region: string | null
          slug: string | null
          topic_type: string
          updated_at: string | null
        }
        Insert: {
          audience_expertise?:
            | Database["public"]["Enums"]["audience_expertise"]
            | null
          branding_config?: Json | null
          competing_regions?: string[] | null
          created_at?: string | null
          created_by: string
          custom_css?: Json | null
          default_tone?: Database["public"]["Enums"]["tone_type"] | null
          default_writing_style?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          keywords?: string[] | null
          landmarks?: string[] | null
          name: string
          negative_keywords?: string[] | null
          organizations?: string[] | null
          postcodes?: string[] | null
          region?: string | null
          slug?: string | null
          topic_type?: string
          updated_at?: string | null
        }
        Update: {
          audience_expertise?:
            | Database["public"]["Enums"]["audience_expertise"]
            | null
          branding_config?: Json | null
          competing_regions?: string[] | null
          created_at?: string | null
          created_by?: string
          custom_css?: Json | null
          default_tone?: Database["public"]["Enums"]["tone_type"] | null
          default_writing_style?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          keywords?: string[] | null
          landmarks?: string[] | null
          name?: string
          negative_keywords?: string[] | null
          organizations?: string[] | null
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
      auto_generate_missing_schedules: {
        Args: Record<PropertyKey, never>
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
      check_newsletter_signup_rate_limit: {
        Args: { p_email: string; p_ip_hash?: string }
        Returns: boolean
      }
      cleanup_duplicate_articles: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      cleanup_existing_duplicates: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      cleanup_old_rate_limits: {
        Args: Record<PropertyKey, never>
        Returns: undefined
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
      delete_story_cascade: {
        Args: { p_story_id: string }
        Returns: Json
      }
      delete_topic_cascade: {
        Args: { p_topic_id: string }
        Returns: Json
      }
      detect_article_duplicates: {
        Args:
          | { p_article_id: string }
          | { p_article_id: string; p_topic_id?: string }
        Returns: {
          detection_method: string
          duplicate_id: string
          similarity_score: number
        }[]
      }
      emergency_manual_scrape: {
        Args: { p_topic_id?: string }
        Returns: Json
      }
      find_duplicate_articles: {
        Args: { p_article_id: string; p_similarity_threshold?: number }
        Returns: {
          detection_method: string
          duplicate_id: string
          similarity_score: number
        }[]
      }
      get_content_sources_count: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      get_current_user_role: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["app_role"]
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
      get_topic_sources: {
        Args: { p_topic_id: string }
        Returns: {
          articles_scraped: number
          canonical_domain: string
          credibility_score: number
          feed_url: string
          is_active: boolean
          last_scraped_at: string
          source_config: Json
          source_id: string
          source_name: string
        }[]
      }
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_feature_enabled: {
        Args: { flag_name: string }
        Returns: boolean
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
      normalize_url: {
        Args: { input_url: string }
        Returns: string
      }
      normalize_url_enhanced: {
        Args: { input_url: string }
        Returns: string
      }
      populate_topic_sources_from_existing: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      record_newsletter_signup_attempt: {
        Args: { p_email: string; p_ip_hash?: string }
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
      reset_stalled_processing: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      reset_stalled_stories: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
      }
      test_rss_import: {
        Args: { p_source_name?: string }
        Returns: Json
      }
      test_search_functionality: {
        Args: { p_search_term?: string }
        Returns: {
          article_id: string
          relevance_score: number
          title: string
        }[]
      }
      update_cron_schedules: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
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
      tone_type: "formal" | "conversational" | "engaging"
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
      tone_type: ["formal", "conversational", "engaging"],
    },
  },
} as const
