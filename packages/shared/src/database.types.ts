
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "agent_credentials": {
                  Row: {
                    "agent_id": string,"created_at": string,"last_used_at": string | null,"token_hash": string,"token_prefix": string,"webhook_secret": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id": string,"created_at"?: string,"last_used_at"?: string | null,"token_hash": string,"token_prefix": string,"webhook_secret"?: string
                  }
                  Update: {
                    "agent_id"?: string,"created_at"?: string,"last_used_at"?: string | null,"token_hash"?: string,"token_prefix"?: string,"webhook_secret"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_credentials_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: true
      referencedRelation: "agents"
      referencedColumns: ["id"]
    }
                  ]
                },"agents": {
                  Row: {
                    "avatar_hue": number,"bio": string,"capabilities": (string)[],"created_at": string,"handle": string,"id": string,"is_public": boolean,"model": string | null,"name": string,"owner_id": string,"public_key": string | null,"rate_tier": number,"search": unknown,"updated_at": string,"verified": boolean,"webhook_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_hue"?: number,"bio"?: string,"capabilities"?: (string)[],"created_at"?: string,"handle": string,"id"?: string,"is_public"?: boolean,"model"?: string | null,"name": string,"owner_id": string,"public_key"?: string | null,"rate_tier"?: number,"search"?: never,"updated_at"?: string,"verified"?: boolean,"webhook_url"?: string | null
                  }
                  Update: {
                    "avatar_hue"?: number,"bio"?: string,"capabilities"?: (string)[],"created_at"?: string,"handle"?: string,"id"?: string,"is_public"?: boolean,"model"?: string | null,"name"?: string,"owner_id"?: string,"public_key"?: string | null,"rate_tier"?: number,"search"?: never,"updated_at"?: string,"verified"?: boolean,"webhook_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "agents_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"approvals": {
                  Row: {
                    "agent_id": string,"chat_id": string,"created_at": string,"decided_at": string | null,"decided_by": string | null,"details": NonNullable<Json>,"expires_at": string,"id": string,"message_id": number,"owner_id": string,"reason": string,"state": Database["public"]['Enums']["approval_state"],"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id": string,"chat_id": string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"details"?: NonNullable<Json>,"expires_at": string,"id"?: string,"message_id": number,"owner_id": string,"reason"?: string,"state"?: Database["public"]['Enums']["approval_state"],"title": string
                  }
                  Update: {
                    "agent_id"?: string,"chat_id"?: string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"details"?: NonNullable<Json>,"expires_at"?: string,"id"?: string,"message_id"?: number,"owner_id"?: string,"reason"?: string,"state"?: Database["public"]['Enums']["approval_state"],"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "approvals_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_chat_id_fkey"
      columns: ["chat_id"]
isOneToOne: false
      referencedRelation: "chats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_message_id_fkey"
      columns: ["message_id"]
isOneToOne: true
      referencedRelation: "messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_members": {
                  Row: {
                    "agent_id": string,"chat_id": string,"joined_at": string,"paused": boolean,"role": Database["public"]['Enums']["member_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id": string,"chat_id": string,"joined_at"?: string,"paused"?: boolean,"role"?: Database["public"]['Enums']["member_role"]
                  }
                  Update: {
                    "agent_id"?: string,"chat_id"?: string,"joined_at"?: string,"paused"?: boolean,"role"?: Database["public"]['Enums']["member_role"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_members_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chat_members_chat_id_fkey"
      columns: ["chat_id"]
isOneToOne: false
      referencedRelation: "chats"
      referencedColumns: ["id"]
    }
                  ]
                },"chats": {
                  Row: {
                    "created_at": string,"created_by": string | null,"goal": string | null,"id": string,"is_public": boolean,"last_message_at": string,"status": Database["public"]['Enums']["task_status"] | null,"title": string | null,"type": Database["public"]['Enums']["chat_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"goal"?: string | null,"id"?: string,"is_public"?: boolean,"last_message_at"?: string,"status"?: Database["public"]['Enums']["task_status"] | null,"title"?: string | null,"type": Database["public"]['Enums']["chat_type"]
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"goal"?: string | null,"id"?: string,"is_public"?: boolean,"last_message_at"?: string,"status"?: Database["public"]['Enums']["task_status"] | null,"title"?: string | null,"type"?: Database["public"]['Enums']["chat_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "chats_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    }
                  ]
                },"deliveries": {
                  Row: {
                    "agent_id": string,"attempts": number,"delivered_at": string | null,"id": number,"last_error": string | null,"message_id": number,"next_attempt_at": string,"status": Database["public"]['Enums']["delivery_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id": string,"attempts"?: number,"delivered_at"?: string | null,"id"?: never,"last_error"?: string | null,"message_id": number,"next_attempt_at"?: string,"status"?: Database["public"]['Enums']["delivery_status"]
                  }
                  Update: {
                    "agent_id"?: string,"attempts"?: number,"delivered_at"?: string | null,"id"?: never,"last_error"?: string | null,"message_id"?: number,"next_attempt_at"?: string,"status"?: Database["public"]['Enums']["delivery_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "deliveries_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deliveries_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "body": NonNullable<Json>,"chat_id": string,"created_at": string,"flag_reason": string | null,"flagged": boolean,"id": number,"kind": Database["public"]['Enums']["message_kind"],"reply_to": number | null,"sender_agent_id": string | null,"sender_user_id": string | null,"signature": string | null,"text": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: NonNullable<Json>,"chat_id": string,"created_at"?: string,"flag_reason"?: string | null,"flagged"?: boolean,"id"?: never,"kind": Database["public"]['Enums']["message_kind"],"reply_to"?: number | null,"sender_agent_id"?: string | null,"sender_user_id"?: string | null,"signature"?: string | null,"text"?: string | null
                  }
                  Update: {
                    "body"?: NonNullable<Json>,"chat_id"?: string,"created_at"?: string,"flag_reason"?: string | null,"flagged"?: boolean,"id"?: never,"kind"?: Database["public"]['Enums']["message_kind"],"reply_to"?: number | null,"sender_agent_id"?: string | null,"sender_user_id"?: string | null,"signature"?: string | null,"text"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_chat_id_fkey"
      columns: ["chat_id"]
isOneToOne: false
      referencedRelation: "chats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_reply_to_fkey"
      columns: ["reply_to"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_agent_id_fkey"
      columns: ["sender_agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_user_id_fkey"
      columns: ["sender_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string,"id": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"reports": {
                  Row: {
                    "created_at": string,"id": number,"message_id": number | null,"reason": string,"reported_agent_id": string,"reporter_agent_id": string | null,"reporter_user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: never,"message_id"?: number | null,"reason": string,"reported_agent_id": string,"reporter_agent_id"?: string | null,"reporter_user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"message_id"?: number | null,"reason"?: string,"reported_agent_id"?: string,"reporter_agent_id"?: string | null,"reporter_user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reported_agent_id_fkey"
      columns: ["reported_agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reporter_agent_id_fkey"
      columns: ["reporter_agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reporter_user_id_fkey"
      columns: ["reporter_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"rules": {
                  Row: {
                    "agent_id": string,"key": string,"updated_at": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id": string,"key": string,"updated_at"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "agent_id"?: string,"key"?: string,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "rules_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "my_chats":
{ Args: Record<PropertyKey, never>; Returns: {
              "goal": string,"id": string,"is_public": boolean,"last_body": Json,"last_kind": Database["public"]['Enums']["message_kind"],"last_message_at": string,"last_sender_agent_id": string,"last_sender_user_id": string,"last_text": string,"status": Database["public"]['Enums']["task_status"],"title": string,"type": Database["public"]['Enums']["chat_type"]
            }[]
                           },
"search_agents":
{ Args: { "lim"?: number,"q"?: string }; Returns: {
              "avatar_hue": number,
"bio": string,
"capabilities": (string)[],
"created_at": string,
"handle": string,
"id": string,
"is_public": boolean,
"model": string | null,
"name": string,
"owner_id": string,
"public_key": string | null,
"rate_tier": number,
"search": unknown,
"updated_at": string,
"verified": boolean,
"webhook_url": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "agents"
        isOneToOne: false
        isSetofReturn: true
      } }
          }
          Enums: {
            "approval_state": "pending"|"approved"|"declined"|"expired","chat_type": "dm"|"group"|"task"|"channel","delivery_status": "pending"|"delivered"|"failed","member_role": "owner"|"member"|"subscriber","message_kind": "text"|"request"|"offer"|"counter_offer"|"result"|"approval_needed"|"system","task_status": "open"|"waiting"|"done"|"failed"|"paused"
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
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "approval_state": ["pending", "approved", "declined", "expired"],"chat_type": ["dm", "group", "task", "channel"],"delivery_status": ["pending", "delivered", "failed"],"member_role": ["owner", "member", "subscriber"],"message_kind": ["text", "request", "offer", "counter_offer", "result", "approval_needed", "system"],"task_status": ["open", "waiting", "done", "failed", "paused"]
          }
        }
} as const
