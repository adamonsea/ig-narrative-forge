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
      articles: {
        Row: {
          author: string | null
          body: string | null
          canonical_url: string | null
          category: string | null
          content_checksum: string | null
          copyright_flags: Json | null
          created_at: string
          id: string
          image_url: string | null
          import_metadata: Json | null
          keywords: string[] | null
          language: string | null
          published_at: string | null
          reading_time_minutes: number | null
          region: string | null
          search: unknown | null
          source_id: string | null
          source_url: string
          summary: string | null
          tags: string[] | null
          title: string
          updated_at: string
          word_count: number | null
        }
        Insert: {
          author?: string | null
          body?: string | null
          canonical_url?: string | null
          category?: string | null
          content_checksum?: string | null
          copyright_flags?: Json | null
          created_at?: string
          id?: string
          image_url?: string | null
          import_metadata?: Json | null
          keywords?: string[] | null
          language?: string | null
          published_at?: string | null
          reading_time_minutes?: number | null
          region?: string | null
          search?: unknown | null
          source_id?: string | null
          source_url: string
          summary?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          word_count?: number | null
        }
        Update: {
          author?: string | null
          body?: string | null
          canonical_url?: string | null
          category?: string | null
          content_checksum?: string | null
          copyright_flags?: Json | null
          created_at?: string
          id?: string
          image_url?: string | null
          import_metadata?: Json | null
          keywords?: string[] | null
          language?: string | null
          published_at?: string | null
          reading_time_minutes?: number | null
          region?: string | null
          search?: unknown | null
          source_id?: string | null
          source_url?: string
          summary?: string | null
          tags?: string[] | null
          title?: string
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
          source_name: string
          success_rate: number | null
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
          source_name: string
          success_rate?: number | null
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
          source_name?: string
          success_rate?: number | null
          updated_at?: string | null
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
        Relationships: []
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
        Relationships: []
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
          created_at: string
          id: string
          publication_name: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          article_id: string
          author?: string | null
          created_at?: string
          id?: string
          publication_name?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          article_id?: string
          author?: string | null
          created_at?: string
          id?: string
          publication_name?: string | null
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
          id: string
          image_url: string | null
          slide_id: string
          style_preset: string | null
          updated_at: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          slide_id: string
          style_preset?: string | null
          updated_at?: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
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
      [_ in never]: never
    }
    Functions: {
      find_duplicate_articles: {
        Args: { p_article_id: string; p_similarity_threshold?: number }
        Returns: {
          detection_method: string
          duplicate_id: string
          similarity_score: number
        }[]
      }
      get_current_user_role: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["app_role"]
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
      log_event: {
        Args: {
          p_context?: Json
          p_function_name?: string
          p_level: string
          p_message: string
        }
        Returns: string
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
    }
    Enums: {
      app_role: "admin" | "user" | "superadmin"
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
    },
  },
} as const
