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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      card_batches: {
        Row: {
          ai_pass_rate: number | null
          created_at: string
          domain: string
          id: string
          sample_pass_rate: number | null
          status: string
          topic_slugs: string[]
        }
        Insert: {
          ai_pass_rate?: number | null
          created_at?: string
          domain: string
          id?: string
          sample_pass_rate?: number | null
          status?: string
          topic_slugs?: string[]
        }
        Update: {
          ai_pass_rate?: number | null
          created_at?: string
          domain?: string
          id?: string
          sample_pass_rate?: number | null
          status?: string
          topic_slugs?: string[]
        }
        Relationships: []
      }
      cards: {
        Row: {
          answer_md: string
          batch_id: string | null
          created_at: string
          difficulty: string | null
          document_id: string | null
          flag_count: number
          format: string
          id: string
          key_points: Json
          options: Json | null
          problem_slug: string | null
          prompt_md: string
          quality: Json
          source_refs: Json
          status: string
          topic_slug: string | null
        }
        Insert: {
          answer_md: string
          batch_id?: string | null
          created_at?: string
          difficulty?: string | null
          document_id?: string | null
          flag_count?: number
          format: string
          id?: string
          key_points?: Json
          options?: Json | null
          problem_slug?: string | null
          prompt_md: string
          quality?: Json
          source_refs?: Json
          status?: string
          topic_slug?: string | null
        }
        Update: {
          answer_md?: string
          batch_id?: string | null
          created_at?: string
          difficulty?: string | null
          document_id?: string | null
          flag_count?: number
          format?: string
          id?: string
          key_points?: Json
          options?: Json | null
          problem_slug?: string | null
          prompt_md?: string
          quality?: Json
          source_refs?: Json
          status?: string
          topic_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cards_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "card_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_problem_slug_fkey"
            columns: ["problem_slug"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "cards_topic_slug_fkey"
            columns: ["topic_slug"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["slug"]
          },
        ]
      }
      checkins: {
        Row: {
          attempts: number | null
          created_at: string
          external_id: string | null
          id: string
          minutes: number | null
          minutes_suggested: number | null
          note: string | null
          problem_slug: string
          result: string
          source: string
          user_id: string
        }
        Insert: {
          attempts?: number | null
          created_at?: string
          external_id?: string | null
          id?: string
          minutes?: number | null
          minutes_suggested?: number | null
          note?: string | null
          problem_slug: string
          result: string
          source?: string
          user_id?: string
        }
        Update: {
          attempts?: number | null
          created_at?: string
          external_id?: string | null
          id?: string
          minutes?: number | null
          minutes_suggested?: number | null
          note?: string | null
          problem_slug?: string
          result?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkins_problem_slug_fkey"
            columns: ["problem_slug"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["slug"]
          },
        ]
      }
      documents: {
        Row: {
          body_md: string
          domain: string
          id: string
          sort: number
          source_id: string | null
          title: string
          topic_slug: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          body_md: string
          domain: string
          id: string
          sort?: number
          source_id?: string | null
          title: string
          topic_slug?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          body_md?: string
          domain?: string
          id?: string
          sort?: number
          source_id?: string | null
          title?: string
          topic_slug?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_topic_slug_fkey"
            columns: ["topic_slug"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["slug"]
          },
        ]
      }
      integration_status: {
        Row: {
          consecutive_failures: number
          enabled: boolean
          last_attempt_at: string | null
          last_success_at: string | null
          provider: string
          totals: Json | null
          user_id: string
        }
        Insert: {
          consecutive_failures?: number
          enabled?: boolean
          last_attempt_at?: string | null
          last_success_at?: string | null
          provider: string
          totals?: Json | null
          user_id: string
        }
        Update: {
          consecutive_failures?: number
          enabled?: boolean
          last_attempt_at?: string | null
          last_success_at?: string | null
          provider?: string
          totals?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      problems: {
        Row: {
          blind75: boolean
          companies: Json
          difficulty: string
          importance: number
          kind: string
          lc_number: number | null
          nc150: boolean
          pattern_slug: string | null
          slug: string
          solutions: Json
          source_id: string | null
          statement_md: string | null
          tags: string[]
          title: string
          topic_slugs: string[]
          updated_at: string
          url: string | null
          video_id: string | null
        }
        Insert: {
          blind75?: boolean
          companies?: Json
          difficulty: string
          importance?: number
          kind: string
          lc_number?: number | null
          nc150?: boolean
          pattern_slug?: string | null
          slug: string
          solutions?: Json
          source_id?: string | null
          statement_md?: string | null
          tags?: string[]
          title: string
          topic_slugs?: string[]
          updated_at?: string
          url?: string | null
          video_id?: string | null
        }
        Update: {
          blind75?: boolean
          companies?: Json
          difficulty?: string
          importance?: number
          kind?: string
          lc_number?: number | null
          nc150?: boolean
          pattern_slug?: string | null
          slug?: string
          solutions?: Json
          source_id?: string | null
          statement_md?: string | null
          tags?: string[]
          title?: string
          topic_slugs?: string[]
          updated_at?: string
          url?: string | null
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "problems_pattern_slug_fkey"
            columns: ["pattern_slug"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "problems_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          campaign_days: number | null
          created_at: string
          language: string | null
          leetcode_username: string | null
          name: string
          notifications: Json
          role: string | null
          setup_done_at: string | null
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          campaign_days?: number | null
          created_at?: string
          language?: string | null
          leetcode_username?: string | null
          name?: string
          notifications?: Json
          role?: string | null
          setup_done_at?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          campaign_days?: number | null
          created_at?: string
          language?: string | null
          leetcode_username?: string | null
          name?: string
          notifications?: Json
          role?: string | null
          setup_done_at?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sources: {
        Row: {
          domain: string
          id: string
          license: string | null
          name: string
          role: string
          url: string | null
        }
        Insert: {
          domain: string
          id: string
          license?: string | null
          name: string
          role: string
          url?: string | null
        }
        Update: {
          domain?: string
          id?: string
          license?: string | null
          name?: string
          role?: string
          url?: string | null
        }
        Relationships: []
      }
      topic_links: {
        Row: {
          from_slug: string
          to_slug: string
        }
        Insert: {
          from_slug: string
          to_slug: string
        }
        Update: {
          from_slug?: string
          to_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_links_from_slug_fkey"
            columns: ["from_slug"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "topic_links_to_slug_fkey"
            columns: ["to_slug"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["slug"]
          },
        ]
      }
      topics: {
        Row: {
          description: string | null
          domain: string
          importance: number
          name: string
          parent_slug: string | null
          slug: string
          sort: number
        }
        Insert: {
          description?: string | null
          domain: string
          importance?: number
          name: string
          parent_slug?: string | null
          slug: string
          sort?: number
        }
        Update: {
          description?: string | null
          domain?: string
          importance?: number
          name?: string
          parent_slug?: string | null
          slug?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "topics_parent_slug_fkey"
            columns: ["parent_slug"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["slug"]
          },
        ]
      }
      user_approvals: {
        Row: {
          decided_at: string | null
          decided_by: string | null
          is_admin: boolean
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          decided_at?: string | null
          decided_by?: string | null
          is_admin?: boolean
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          decided_at?: string | null
          decided_by?: string | null
          is_admin?: boolean
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      checkins_public: {
        Row: {
          attempts: number | null
          created_at: string | null
          id: string | null
          minutes: number | null
          problem_slug: string | null
          result: string | null
          source: string | null
          user_id: string | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          id?: string | null
          minutes?: number | null
          problem_slug?: string | null
          result?: string | null
          source?: string | null
          user_id?: string | null
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          id?: string | null
          minutes?: number | null
          problem_slug?: string | null
          result?: string | null
          source?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkins_problem_slug_fkey"
            columns: ["problem_slug"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["slug"]
          },
        ]
      }
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
      is_approved: { Args: never; Returns: boolean }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
