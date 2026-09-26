
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "ai_usage": {
                  Row: {
                    "cost_usd": number,"created_at": string,"id": string,"model": string,"route": string,"tokens_in": number,"tokens_out": number,"user_id": string | null
                  }
                  Insert: {
                    "cost_usd"?: number,"created_at"?: string,"id"?: string,"model": string,"route": string,"tokens_in"?: number,"tokens_out"?: number,"user_id"?: string | null
                  }
                  Update: {
                    "cost_usd"?: number,"created_at"?: string,"id"?: string,"model"?: string,"route"?: string,"tokens_in"?: number,"tokens_out"?: number,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"batch_review_items": {
                  Row: {
                    "batch_id": string,"card_id": string,"created_at": string,"decided_by": string | null,"note": string | null,"verdict": string
                  }
                  Insert: {
                    "batch_id": string,"card_id": string,"created_at"?: string,"decided_by"?: string | null,"note"?: string | null,"verdict": string
                  }
                  Update: {
                    "batch_id"?: string,"card_id"?: string,"created_at"?: string,"decided_by"?: string | null,"note"?: string | null,"verdict"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "batch_review_items_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "card_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_review_items_card_id_fkey"
      columns: ["card_id"]
isOneToOne: false
      referencedRelation: "cards"
      referencedColumns: ["id"]
    }
                  ]
                },"campaigns": {
                  Row: {
                    "company_focus": Json | null,"created_at": string,"id": string,"length_days": number,"start_date": string,"status": string,"templates": NonNullable<Json>,"user_id": string
                  }
                  Insert: {
                    "company_focus"?: Json | null,"created_at"?: string,"id"?: string,"length_days": number,"start_date": string,"status"?: string,"templates": NonNullable<Json>,"user_id"?: string
                  }
                  Update: {
                    "company_focus"?: Json | null,"created_at"?: string,"id"?: string,"length_days"?: number,"start_date"?: string,"status"?: string,"templates"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"card_batches": {
                  Row: {
                    "ai_pass_rate": number | null,"created_at": string,"domain": string,"id": string,"label": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"sample_pass_rate": number | null,"status": string,"topic_slugs": (string)[]
                  }
                  Insert: {
                    "ai_pass_rate"?: number | null,"created_at"?: string,"domain": string,"id"?: string,"label"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sample_pass_rate"?: number | null,"status"?: string,"topic_slugs"?: (string)[]
                  }
                  Update: {
                    "ai_pass_rate"?: number | null,"created_at"?: string,"domain"?: string,"id"?: string,"label"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sample_pass_rate"?: number | null,"status"?: string,"topic_slugs"?: (string)[]
                  }
                  Relationships: [
                    
                  ]
                },"card_flags": {
                  Row: {
                    "card_id": string,"created_at": string,"reason": string,"user_id": string
                  }
                  Insert: {
                    "card_id": string,"created_at"?: string,"reason": string,"user_id"?: string
                  }
                  Update: {
                    "card_id"?: string,"created_at"?: string,"reason"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "card_flags_card_id_fkey"
      columns: ["card_id"]
isOneToOne: false
      referencedRelation: "cards"
      referencedColumns: ["id"]
    }
                  ]
                },"card_reviews": {
                  Row: {
                    "answer": string,"card_id": string,"created_at": string,"diagnostic": boolean,"graded_by": string,"id": string,"outcome": string,"points_hit": NonNullable<Json>,"score": number,"used_options": boolean,"user_id": string
                  }
                  Insert: {
                    "answer"?: string,"card_id": string,"created_at"?: string,"diagnostic"?: boolean,"graded_by": string,"id"?: string,"outcome": string,"points_hit"?: NonNullable<Json>,"score": number,"used_options"?: boolean,"user_id"?: string
                  }
                  Update: {
                    "answer"?: string,"card_id"?: string,"created_at"?: string,"diagnostic"?: boolean,"graded_by"?: string,"id"?: string,"outcome"?: string,"points_hit"?: NonNullable<Json>,"score"?: number,"used_options"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "card_reviews_card_id_fkey"
      columns: ["card_id"]
isOneToOne: false
      referencedRelation: "cards"
      referencedColumns: ["id"]
    }
                  ]
                },"card_state": {
                  Row: {
                    "card_id": string,"difficulty": number,"due_at": string,"lapses": number,"last_review": string | null,"reps": number,"stability": number,"state": number,"user_id": string
                  }
                  Insert: {
                    "card_id": string,"difficulty": number,"due_at": string,"lapses"?: number,"last_review"?: string | null,"reps"?: number,"stability": number,"state"?: number,"user_id"?: string
                  }
                  Update: {
                    "card_id"?: string,"difficulty"?: number,"due_at"?: string,"lapses"?: number,"last_review"?: string | null,"reps"?: number,"stability"?: number,"state"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "card_state_card_id_fkey"
      columns: ["card_id"]
isOneToOne: false
      referencedRelation: "cards"
      referencedColumns: ["id"]
    }
                  ]
                },"cards": {
                  Row: {
                    "answer_md": string,"batch_id": string | null,"created_at": string,"difficulty": string | null,"document_id": string | null,"flag_count": number,"format": string,"hidden": boolean,"id": string,"key_points": NonNullable<Json>,"options": Json | null,"problem_slug": string | null,"prompt_md": string,"quality": NonNullable<Json>,"risk": number | null,"source_refs": NonNullable<Json>,"status": string,"topic_slug": string | null
                  }
                  Insert: {
                    "answer_md": string,"batch_id"?: string | null,"created_at"?: string,"difficulty"?: string | null,"document_id"?: string | null,"flag_count"?: number,"format": string,"hidden"?: boolean,"id"?: string,"key_points"?: NonNullable<Json>,"options"?: Json | null,"problem_slug"?: string | null,"prompt_md": string,"quality"?: NonNullable<Json>,"risk"?: number | null,"source_refs"?: NonNullable<Json>,"status"?: string,"topic_slug"?: string | null
                  }
                  Update: {
                    "answer_md"?: string,"batch_id"?: string | null,"created_at"?: string,"difficulty"?: string | null,"document_id"?: string | null,"flag_count"?: number,"format"?: string,"hidden"?: boolean,"id"?: string,"key_points"?: NonNullable<Json>,"options"?: Json | null,"problem_slug"?: string | null,"prompt_md"?: string,"quality"?: NonNullable<Json>,"risk"?: number | null,"source_refs"?: NonNullable<Json>,"status"?: string,"topic_slug"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cards_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "card_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cards_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cards_problem_slug_fkey"
      columns: ["problem_slug"]
isOneToOne: false
      referencedRelation: "problems"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "cards_topic_slug_fkey"
      columns: ["topic_slug"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["slug"]
    }
                  ]
                },"checkin_notes": {
                  Row: {
                    "checkin_id": string,"note": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "checkin_id": string,"note": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "checkin_id"?: string,"note"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "checkin_notes_checkin_id_fkey"
      columns: ["checkin_id"]
isOneToOne: true
      referencedRelation: "checkins"
      referencedColumns: ["id"]
    }
                  ]
                },"checkins": {
                  Row: {
                    "attempts": number | null,"created_at": string,"external_id": string | null,"id": string,"minutes": number | null,"minutes_suggested": number | null,"problem_slug": string,"result": string,"source": string,"user_id": string
                  }
                  Insert: {
                    "attempts"?: number | null,"created_at"?: string,"external_id"?: string | null,"id"?: string,"minutes"?: number | null,"minutes_suggested"?: number | null,"problem_slug": string,"result": string,"source"?: string,"user_id"?: string
                  }
                  Update: {
                    "attempts"?: number | null,"created_at"?: string,"external_id"?: string | null,"id"?: string,"minutes"?: number | null,"minutes_suggested"?: number | null,"problem_slug"?: string,"result"?: string,"source"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "checkins_problem_slug_fkey"
      columns: ["problem_slug"]
isOneToOne: false
      referencedRelation: "problems"
      referencedColumns: ["slug"]
    }
                  ]
                },"days": {
                  Row: {
                    "campaign_id": string,"closed_at": string | null,"date": string,"status": string,"user_id": string
                  }
                  Insert: {
                    "campaign_id": string,"closed_at"?: string | null,"date": string,"status"?: string,"user_id"?: string
                  }
                  Update: {
                    "campaign_id"?: string,"closed_at"?: string | null,"date"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "days_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    }
                  ]
                },"documents": {
                  Row: {
                    "body_md": string,"domain": string,"id": string,"sort": number,"source_id": string | null,"title": string,"topic_slug": string | null,"updated_at": string,"url": string | null
                  }
                  Insert: {
                    "body_md": string,"domain": string,"id": string,"sort"?: number,"source_id"?: string | null,"title": string,"topic_slug"?: string | null,"updated_at"?: string,"url"?: string | null
                  }
                  Update: {
                    "body_md"?: string,"domain"?: string,"id"?: string,"sort"?: number,"source_id"?: string | null,"title"?: string,"topic_slug"?: string | null,"updated_at"?: string,"url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "documents_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_topic_slug_fkey"
      columns: ["topic_slug"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["slug"]
    }
                  ]
                },"integration_status": {
                  Row: {
                    "consecutive_failures": number,"enabled": boolean,"last_attempt_at": string | null,"last_success_at": string | null,"provider": string,"totals": Json | null,"user_id": string
                  }
                  Insert: {
                    "consecutive_failures"?: number,"enabled"?: boolean,"last_attempt_at"?: string | null,"last_success_at"?: string | null,"provider": string,"totals"?: Json | null,"user_id": string
                  }
                  Update: {
                    "consecutive_failures"?: number,"enabled"?: boolean,"last_attempt_at"?: string | null,"last_success_at"?: string | null,"provider"?: string,"totals"?: Json | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"missions": {
                  Row: {
                    "checkin_id": string | null,"date": string,"done_at": string | null,"est_minutes": number,"id": string,"is_revive": boolean,"reason": string,"ref": string,"revive_of": string | null,"slot_type": string,"status": string,"user_id": string
                  }
                  Insert: {
                    "checkin_id"?: string | null,"date": string,"done_at"?: string | null,"est_minutes": number,"id"?: string,"is_revive"?: boolean,"reason"?: string,"ref": string,"revive_of"?: string | null,"slot_type": string,"status"?: string,"user_id"?: string
                  }
                  Update: {
                    "checkin_id"?: string | null,"date"?: string,"done_at"?: string | null,"est_minutes"?: number,"id"?: string,"is_revive"?: boolean,"reason"?: string,"ref"?: string,"revive_of"?: string | null,"slot_type"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "missions_checkin_id_fkey"
      columns: ["checkin_id"]
isOneToOne: false
      referencedRelation: "checkins"
      referencedColumns: ["id"]
    }
                  ]
                },"pattern_tricks": {
                  Row: {
                    "id": string,"idea_md": string,"name": string,"pattern_slug": string,"problem_slugs": (string)[],"snippets": NonNullable<Json>,"sort": number
                  }
                  Insert: {
                    "id": string,"idea_md": string,"name": string,"pattern_slug": string,"problem_slugs"?: (string)[],"snippets"?: NonNullable<Json>,"sort"?: number
                  }
                  Update: {
                    "id"?: string,"idea_md"?: string,"name"?: string,"pattern_slug"?: string,"problem_slugs"?: (string)[],"snippets"?: NonNullable<Json>,"sort"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "pattern_tricks_pattern_slug_fkey"
      columns: ["pattern_slug"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["slug"]
    }
                  ]
                },"problem_reviews": {
                  Row: {
                    "due_date": string,"problem_slug": string,"status": string,"step": number,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "due_date": string,"problem_slug": string,"status"?: string,"step": number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "due_date"?: string,"problem_slug"?: string,"status"?: string,"step"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "problem_reviews_problem_slug_fkey"
      columns: ["problem_slug"]
isOneToOne: false
      referencedRelation: "problems"
      referencedColumns: ["slug"]
    }
                  ]
                },"problems": {
                  Row: {
                    "blind75": boolean,"companies": NonNullable<Json>,"difficulty": string,"importance": number,"kind": string,"lc_number": number | null,"nc150": boolean,"pattern_slug": string | null,"premium": boolean,"slug": string,"solutions": NonNullable<Json>,"source_id": string | null,"statement_md": string | null,"tags": (string)[],"techniques": (string)[],"title": string,"topic_slugs": (string)[],"updated_at": string,"url": string | null,"video_id": string | null
                  }
                  Insert: {
                    "blind75"?: boolean,"companies"?: NonNullable<Json>,"difficulty": string,"importance"?: number,"kind": string,"lc_number"?: number | null,"nc150"?: boolean,"pattern_slug"?: string | null,"premium"?: boolean,"slug": string,"solutions"?: NonNullable<Json>,"source_id"?: string | null,"statement_md"?: string | null,"tags"?: (string)[],"techniques"?: (string)[],"title": string,"topic_slugs"?: (string)[],"updated_at"?: string,"url"?: string | null,"video_id"?: string | null
                  }
                  Update: {
                    "blind75"?: boolean,"companies"?: NonNullable<Json>,"difficulty"?: string,"importance"?: number,"kind"?: string,"lc_number"?: number | null,"nc150"?: boolean,"pattern_slug"?: string | null,"premium"?: boolean,"slug"?: string,"solutions"?: NonNullable<Json>,"source_id"?: string | null,"statement_md"?: string | null,"tags"?: (string)[],"techniques"?: (string)[],"title"?: string,"topic_slugs"?: (string)[],"updated_at"?: string,"url"?: string | null,"video_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "problems_pattern_slug_fkey"
      columns: ["pattern_slug"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "problems_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"campaign_days": number | null,"created_at": string,"diagnostic_done_at": string | null,"feed_topics": Json | null,"has_leetcode_premium": boolean,"language": string | null,"leetcode_username": string | null,"morning_push_hour": number | null,"name": string,"notifications": NonNullable<Json>,"role": string | null,"setup_done_at": string | null,"timezone": string,"updated_at": string,"user_id": string,"weekday_minutes": number | null,"weekend_minutes": number | null
                  }
                  Insert: {
                    "avatar_url"?: string | null,"campaign_days"?: number | null,"created_at"?: string,"diagnostic_done_at"?: string | null,"feed_topics"?: Json | null,"has_leetcode_premium"?: boolean,"language"?: string | null,"leetcode_username"?: string | null,"morning_push_hour"?: number | null,"name"?: string,"notifications"?: NonNullable<Json>,"role"?: string | null,"setup_done_at"?: string | null,"timezone"?: string,"updated_at"?: string,"user_id": string,"weekday_minutes"?: number | null,"weekend_minutes"?: number | null
                  }
                  Update: {
                    "avatar_url"?: string | null,"campaign_days"?: number | null,"created_at"?: string,"diagnostic_done_at"?: string | null,"feed_topics"?: Json | null,"has_leetcode_premium"?: boolean,"language"?: string | null,"leetcode_username"?: string | null,"morning_push_hour"?: number | null,"name"?: string,"notifications"?: NonNullable<Json>,"role"?: string | null,"setup_done_at"?: string | null,"timezone"?: string,"updated_at"?: string,"user_id"?: string,"weekday_minutes"?: number | null,"weekend_minutes"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"id": string,"p256dh": string,"user_id": string
                  }
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"id"?: string,"p256dh": string,"user_id"?: string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"p256dh"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"readiness_snapshots": {
                  Row: {
                    "date": string,"overall": number | null,"per_area": NonNullable<Json>,"user_id": string
                  }
                  Insert: {
                    "date": string,"overall"?: number | null,"per_area"?: NonNullable<Json>,"user_id"?: string
                  }
                  Update: {
                    "date"?: string,"overall"?: number | null,"per_area"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sources": {
                  Row: {
                    "domain": string,"id": string,"license": string | null,"name": string,"role": string,"url": string | null
                  }
                  Insert: {
                    "domain": string,"id": string,"license"?: string | null,"name": string,"role": string,"url"?: string | null
                  }
                  Update: {
                    "domain"?: string,"id"?: string,"license"?: string | null,"name"?: string,"role"?: string,"url"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"topic_links": {
                  Row: {
                    "from_slug": string,"to_slug": string
                  }
                  Insert: {
                    "from_slug": string,"to_slug": string
                  }
                  Update: {
                    "from_slug"?: string,"to_slug"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "topic_links_from_slug_fkey"
      columns: ["from_slug"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "topic_links_to_slug_fkey"
      columns: ["to_slug"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["slug"]
    }
                  ]
                },"topic_progress": {
                  Row: {
                    "studied_at": string,"topic_slug": string,"user_id": string
                  }
                  Insert: {
                    "studied_at"?: string,"topic_slug": string,"user_id"?: string
                  }
                  Update: {
                    "studied_at"?: string,"topic_slug"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "topic_progress_topic_slug_fkey"
      columns: ["topic_slug"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["slug"]
    }
                  ]
                },"topics": {
                  Row: {
                    "description": string | null,"domain": string,"importance": number,"name": string,"parent_slug": string | null,"slug": string,"sort": number
                  }
                  Insert: {
                    "description"?: string | null,"domain": string,"importance"?: number,"name": string,"parent_slug"?: string | null,"slug": string,"sort"?: number
                  }
                  Update: {
                    "description"?: string | null,"domain"?: string,"importance"?: number,"name"?: string,"parent_slug"?: string | null,"slug"?: string,"sort"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "topics_parent_slug_fkey"
      columns: ["parent_slug"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["slug"]
    }
                  ]
                },"user_approvals": {
                  Row: {
                    "decided_at": string | null,"decided_by": string | null,"is_admin": boolean,"requested_at": string,"status": string,"user_id": string
                  }
                  Insert: {
                    "decided_at"?: string | null,"decided_by"?: string | null,"is_admin"?: boolean,"requested_at"?: string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "decided_at"?: string | null,"decided_by"?: string | null,"is_admin"?: boolean,"requested_at"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_approved":
{ Args: Record<PropertyKey, never>; Returns: boolean
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const

