
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
            "agent_briefs": {
                  Row: {
                    "agent_id": string,"instructions": string,"role": string,"template": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id": string,"instructions"?: string,"role"?: string,"template"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "agent_id"?: string,"instructions"?: string,"role"?: string,"template"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_briefs_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: true
      referencedRelation: "agents"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_checks": {
                  Row: {
                    "agent_id": string,"checked_at": string,"detail": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id": string,"checked_at"?: string,"detail"?: string | null,"status": string
                  }
                  Update: {
                    "agent_id"?: string,"checked_at"?: string,"detail"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_checks_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: true
      referencedRelation: "agents"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_credentials": {
                  Row: {
                    "agent_id": string,"created_at": string,"last_used_at": string | null,"scope": string,"token_hash": string,"token_prefix": string,"webhook_secret": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id": string,"created_at"?: string,"last_used_at"?: string | null,"scope"?: string,"token_hash": string,"token_prefix": string,"webhook_secret"?: string
                  }
                  Update: {
                    "agent_id"?: string,"created_at"?: string,"last_used_at"?: string | null,"scope"?: string,"token_hash"?: string,"token_prefix"?: string,"webhook_secret"?: string
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
                },"agent_grants": {
                  Row: {
                    "agent_id": string,"blocked": boolean,"connecting_agent_id": string | null,"created_at": string,"daily_messages": number | null,"expires_at": string | null,"grantee_id": string,"id": string,"last_used_at": string | null,"messages_today": number,"messages_used": number,"revoked_at": string | null,"role": string,"token_budget": number | null,"tokens_used": number,"usage_day": string,"via_link": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id": string,"blocked"?: boolean,"connecting_agent_id"?: string | null,"created_at"?: string,"daily_messages"?: number | null,"expires_at"?: string | null,"grantee_id": string,"id"?: string,"last_used_at"?: string | null,"messages_today"?: number,"messages_used"?: number,"revoked_at"?: string | null,"role"?: string,"token_budget"?: number | null,"tokens_used"?: number,"usage_day"?: string,"via_link"?: string | null
                  }
                  Update: {
                    "agent_id"?: string,"blocked"?: boolean,"connecting_agent_id"?: string | null,"created_at"?: string,"daily_messages"?: number | null,"expires_at"?: string | null,"grantee_id"?: string,"id"?: string,"last_used_at"?: string | null,"messages_today"?: number,"messages_used"?: number,"revoked_at"?: string | null,"role"?: string,"token_budget"?: number | null,"tokens_used"?: number,"usage_day"?: string,"via_link"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_grants_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_grants_connecting_agent_id_fkey"
      columns: ["connecting_agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_grants_grantee_id_fkey"
      columns: ["grantee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_secrets": {
                  Row: {
                    "agent_id": string,"base_url": string | null,"ciphertext": string,"created_at": string,"hint": string,"model": string,"provider": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id": string,"base_url"?: string | null,"ciphertext": string,"created_at"?: string,"hint"?: string,"model": string,"provider": string
                  }
                  Update: {
                    "agent_id"?: string,"base_url"?: string | null,"ciphertext"?: string,"created_at"?: string,"hint"?: string,"model"?: string,"provider"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_secrets_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: true
      referencedRelation: "agents"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_usage": {
                  Row: {
                    "agent_id": string,"day": string,"llm_calls": number,"messages": number,"tokens": number
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id": string,"day"?: string,"llm_calls"?: number,"messages"?: number,"tokens"?: number
                  }
                  Update: {
                    "agent_id"?: string,"day"?: string,"llm_calls"?: number,"messages"?: number,"tokens"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_usage_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    }
                  ]
                },"agents": {
                  Row: {
                    "avatar_hue": number,"bio": string,"capabilities": (string)[],"cold_contact_cap": number,"created_at": string,"daily_message_cap": number,"daily_token_cap": number,"guest_policy": NonNullable<Json>,"handle": string,"hosting": string,"id": string,"inbound_policy": Database["public"]['Enums']["inbound_policy"],"is_main": boolean,"is_public": boolean,"max_tool_steps": number,"model": string | null,"name": string,"owner_id": string,"paused": boolean,"public_key": string | null,"rate_tier": number,"runner_seen_at": string | null,"search": unknown,"updated_at": string,"verified": boolean,"visibility": Database["public"]['Enums']["agent_visibility"],"webhook_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_hue"?: number,"bio"?: string,"capabilities"?: (string)[],"cold_contact_cap"?: number,"created_at"?: string,"daily_message_cap"?: number,"daily_token_cap"?: number,"guest_policy"?: NonNullable<Json>,"handle": string,"hosting"?: string,"id"?: string,"inbound_policy"?: Database["public"]['Enums']["inbound_policy"],"is_main"?: boolean,"is_public"?: boolean,"max_tool_steps"?: number,"model"?: string | null,"name": string,"owner_id": string,"paused"?: boolean,"public_key"?: string | null,"rate_tier"?: number,"runner_seen_at"?: string | null,"search"?: never,"updated_at"?: string,"verified"?: boolean,"visibility"?: Database["public"]['Enums']["agent_visibility"],"webhook_url"?: string | null
                  }
                  Update: {
                    "avatar_hue"?: number,"bio"?: string,"capabilities"?: (string)[],"cold_contact_cap"?: number,"created_at"?: string,"daily_message_cap"?: number,"daily_token_cap"?: number,"guest_policy"?: NonNullable<Json>,"handle"?: string,"hosting"?: string,"id"?: string,"inbound_policy"?: Database["public"]['Enums']["inbound_policy"],"is_main"?: boolean,"is_public"?: boolean,"max_tool_steps"?: number,"model"?: string | null,"name"?: string,"owner_id"?: string,"paused"?: boolean,"public_key"?: string | null,"rate_tier"?: number,"runner_seen_at"?: string | null,"search"?: never,"updated_at"?: string,"verified"?: boolean,"visibility"?: Database["public"]['Enums']["agent_visibility"],"webhook_url"?: string | null
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
                    "action": Json | null,"agent_id": string,"chat_id": string,"created_at": string,"decided_at": string | null,"decided_by": string | null,"details": NonNullable<Json>,"execution_detail": string | null,"execution_state": string | null,"expires_at": string,"id": string,"message_id": number,"owner_id": string,"reason": string,"state": Database["public"]['Enums']["approval_state"],"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action"?: Json | null,"agent_id": string,"chat_id": string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"details"?: NonNullable<Json>,"execution_detail"?: string | null,"execution_state"?: string | null,"expires_at": string,"id"?: string,"message_id": number,"owner_id": string,"reason"?: string,"state"?: Database["public"]['Enums']["approval_state"],"title": string
                  }
                  Update: {
                    "action"?: Json | null,"agent_id"?: string,"chat_id"?: string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"details"?: NonNullable<Json>,"execution_detail"?: string | null,"execution_state"?: string | null,"expires_at"?: string,"id"?: string,"message_id"?: number,"owner_id"?: string,"reason"?: string,"state"?: Database["public"]['Enums']["approval_state"],"title"?: string
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
                },"channel_config": {
                  Row: {
                    "active": boolean,"cadence_minutes": number,"chat_id": string,"description": string,"est_monthly_tokens": number,"idea_id": string | null,"language": string,"last_run_at": string | null,"next_run_at": string,"publisher_agent_id": string,"rules": string,"sources": NonNullable<Json>,"tone": string,"topic": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"cadence_minutes"?: number,"chat_id": string,"description"?: string,"est_monthly_tokens"?: number,"idea_id"?: string | null,"language"?: string,"last_run_at"?: string | null,"next_run_at"?: string,"publisher_agent_id": string,"rules"?: string,"sources"?: NonNullable<Json>,"tone"?: string,"topic": string
                  }
                  Update: {
                    "active"?: boolean,"cadence_minutes"?: number,"chat_id"?: string,"description"?: string,"est_monthly_tokens"?: number,"idea_id"?: string | null,"language"?: string,"last_run_at"?: string | null,"next_run_at"?: string,"publisher_agent_id"?: string,"rules"?: string,"sources"?: NonNullable<Json>,"tone"?: string,"topic"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "channel_config_chat_id_fkey"
      columns: ["chat_id"]
isOneToOne: true
      referencedRelation: "chats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "channel_config_idea_id_fkey"
      columns: ["idea_id"]
isOneToOne: false
      referencedRelation: "channel_ideas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "channel_config_publisher_agent_id_fkey"
      columns: ["publisher_agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    }
                  ]
                },"channel_idea_votes": {
                  Row: {
                    "idea_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "idea_id": string,"user_id": string
                  }
                  Update: {
                    "idea_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "channel_idea_votes_idea_id_fkey"
      columns: ["idea_id"]
isOneToOne: false
      referencedRelation: "channel_ideas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "channel_idea_votes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"channel_ideas": {
                  Row: {
                    "cadence_minutes": number,"claimed_chat_id": string | null,"created_at": string,"id": string,"language": string,"moderation_note": string | null,"proposer_id": string,"rules": string,"sources": NonNullable<Json>,"status": string,"tone": string,"topic": string,"votes": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cadence_minutes"?: number,"claimed_chat_id"?: string | null,"created_at"?: string,"id"?: string,"language"?: string,"moderation_note"?: string | null,"proposer_id": string,"rules"?: string,"sources"?: NonNullable<Json>,"status"?: string,"tone"?: string,"topic": string,"votes"?: number
                  }
                  Update: {
                    "cadence_minutes"?: number,"claimed_chat_id"?: string | null,"created_at"?: string,"id"?: string,"language"?: string,"moderation_note"?: string | null,"proposer_id"?: string,"rules"?: string,"sources"?: NonNullable<Json>,"status"?: string,"tone"?: string,"topic"?: string,"votes"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "channel_ideas_claimed_chat_id_fkey"
      columns: ["claimed_chat_id"]
isOneToOne: false
      referencedRelation: "chats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "channel_ideas_proposer_id_fkey"
      columns: ["proposer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_members": {
                  Row: {
                    "agent_id": string,"chat_id": string,"context": string | null,"joined_at": string,"paused": boolean,"role": Database["public"]['Enums']["member_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id": string,"chat_id": string,"context"?: string | null,"joined_at"?: string,"paused"?: boolean,"role"?: Database["public"]['Enums']["member_role"]
                  }
                  Update: {
                    "agent_id"?: string,"chat_id"?: string,"context"?: string | null,"joined_at"?: string,"paused"?: boolean,"role"?: Database["public"]['Enums']["member_role"]
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
                    "created_at": string,"created_by": string | null,"frozen": boolean,"frozen_at": string | null,"frozen_reason": string | null,"goal": string | null,"id": string,"is_public": boolean,"kind": Database["public"]['Enums']["chat_kind"],"last_message_at": string,"origin": Json | null,"request_state": string | null,"request_to": string | null,"status": Database["public"]['Enums']["task_status"] | null,"title": string | null,"type": Database["public"]['Enums']["chat_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"frozen"?: boolean,"frozen_at"?: string | null,"frozen_reason"?: string | null,"goal"?: string | null,"id"?: string,"is_public"?: boolean,"kind"?: Database["public"]['Enums']["chat_kind"],"last_message_at"?: string,"origin"?: Json | null,"request_state"?: string | null,"request_to"?: string | null,"status"?: Database["public"]['Enums']["task_status"] | null,"title"?: string | null,"type": Database["public"]['Enums']["chat_type"]
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"frozen"?: boolean,"frozen_at"?: string | null,"frozen_reason"?: string | null,"goal"?: string | null,"id"?: string,"is_public"?: boolean,"kind"?: Database["public"]['Enums']["chat_kind"],"last_message_at"?: string,"origin"?: Json | null,"request_state"?: string | null,"request_to"?: string | null,"status"?: Database["public"]['Enums']["task_status"] | null,"title"?: string | null,"type"?: Database["public"]['Enums']["chat_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "chats_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chats_request_to_fkey"
      columns: ["request_to"]
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
                },"device_codes": {
                  Row: {
                    "agent_id": string | null,"client_name": string,"created_at": string,"device_hash": string,"expires_at": string,"id": string,"owner_id": string | null,"pending_token": string | null,"status": string,"user_code": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id"?: string | null,"client_name"?: string,"created_at"?: string,"device_hash": string,"expires_at"?: string,"id"?: string,"owner_id"?: string | null,"pending_token"?: string | null,"status"?: string,"user_code": string
                  }
                  Update: {
                    "agent_id"?: string | null,"client_name"?: string,"created_at"?: string,"device_hash"?: string,"expires_at"?: string,"id"?: string,"owner_id"?: string | null,"pending_token"?: string | null,"status"?: string,"user_code"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "device_codes_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "device_codes_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"jobs": {
                  Row: {
                    "agent_id": string,"attempts": number,"chat_id": string | null,"claimed_at": string | null,"claimed_by": string | null,"created_at": string,"finished_at": string | null,"id": number,"kind": string,"last_error": string | null,"message_id": number | null,"run_after": string,"status": Database["public"]['Enums']["job_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id": string,"attempts"?: number,"chat_id"?: string | null,"claimed_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"finished_at"?: string | null,"id"?: never,"kind": string,"last_error"?: string | null,"message_id"?: number | null,"run_after"?: string,"status"?: Database["public"]['Enums']["job_status"]
                  }
                  Update: {
                    "agent_id"?: string,"attempts"?: number,"chat_id"?: string | null,"claimed_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"finished_at"?: string | null,"id"?: never,"kind"?: string,"last_error"?: string | null,"message_id"?: number | null,"run_after"?: string,"status"?: Database["public"]['Enums']["job_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "jobs_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "jobs_chat_id_fkey"
      columns: ["chat_id"]
isOneToOne: false
      referencedRelation: "chats"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "attachments": NonNullable<Json>,"body": NonNullable<Json>,"chat_id": string,"created_at": string,"expects_reply": boolean,"flag_reason": string | null,"flagged": boolean,"id": number,"kind": Database["public"]['Enums']["message_kind"],"owner_client_nonce": string | null,"removed_at": string | null,"removed_reason": string | null,"reply_to": number | null,"sender_agent_id": string | null,"sender_user_id": string | null,"signature": string | null,"text": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attachments"?: NonNullable<Json>,"body"?: NonNullable<Json>,"chat_id": string,"created_at"?: string,"expects_reply"?: boolean,"flag_reason"?: string | null,"flagged"?: boolean,"id"?: never,"kind": Database["public"]['Enums']["message_kind"],"owner_client_nonce"?: string | null,"removed_at"?: string | null,"removed_reason"?: string | null,"reply_to"?: number | null,"sender_agent_id"?: string | null,"sender_user_id"?: string | null,"signature"?: string | null,"text"?: string | null
                  }
                  Update: {
                    "attachments"?: NonNullable<Json>,"body"?: NonNullable<Json>,"chat_id"?: string,"created_at"?: string,"expects_reply"?: boolean,"flag_reason"?: string | null,"flagged"?: boolean,"id"?: never,"kind"?: Database["public"]['Enums']["message_kind"],"owner_client_nonce"?: string | null,"removed_at"?: string | null,"removed_reason"?: string | null,"reply_to"?: number | null,"sender_agent_id"?: string | null,"sender_user_id"?: string | null,"signature"?: string | null,"text"?: string | null
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
                },"model_rates": {
                  Row: {
                    "input_per_million": number,"model": string,"output_per_million": number,"provider": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "input_per_million": number,"model": string,"output_per_million": number,"provider": string,"user_id": string
                  }
                  Update: {
                    "input_per_million"?: number,"model"?: string,"output_per_million"?: number,"provider"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "model_rates_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"model_usage": {
                  Row: {
                    "agent_id": string,"chat_id": string | null,"created_at": string,"id": number,"input_tokens": number,"model": string,"output_tokens": number,"provider": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id": string,"chat_id"?: string | null,"created_at"?: string,"id"?: never,"input_tokens": number,"model": string,"output_tokens": number,"provider": string
                  }
                  Update: {
                    "agent_id"?: string,"chat_id"?: string | null,"created_at"?: string,"id"?: never,"input_tokens"?: number,"model"?: string,"output_tokens"?: number,"provider"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "model_usage_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "model_usage_chat_id_fkey"
      columns: ["chat_id"]
isOneToOne: false
      referencedRelation: "chats"
      referencedColumns: ["id"]
    }
                  ]
                },"owner_attachments": {
                  Row: {
                    "chat_id": string,"created_at": string,"height": number | null,"id": string,"message_id": number | null,"mime": string,"name": string,"owner_id": string,"size": number,"storage_path": string,"type": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "chat_id": string,"created_at"?: string,"height"?: number | null,"id"?: string,"message_id"?: number | null,"mime": string,"name": string,"owner_id": string,"size": number,"storage_path": string,"type": string,"width"?: number | null
                  }
                  Update: {
                    "chat_id"?: string,"created_at"?: string,"height"?: number | null,"id"?: string,"message_id"?: number | null,"mime"?: string,"name"?: string,"owner_id"?: string,"size"?: number,"storage_path"?: string,"type"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "owner_attachments_chat_id_fkey"
      columns: ["chat_id"]
isOneToOne: false
      referencedRelation: "chats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "owner_attachments_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "owner_attachments_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"owner_channel_state": {
                  Row: {
                    "chat_id": string,"last_read_id": number,"notifications": boolean,"saved_ids": (number)[],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chat_id": string,"last_read_id"?: number,"notifications"?: boolean,"saved_ids"?: (number)[],"user_id": string
                  }
                  Update: {
                    "chat_id"?: string,"last_read_id"?: number,"notifications"?: boolean,"saved_ids"?: (number)[],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "owner_channel_state_chat_id_fkey"
      columns: ["chat_id"]
isOneToOne: false
      referencedRelation: "chats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "owner_channel_state_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profile_settings": {
                  Row: {
                    "intent": string | null,"is_admin": boolean,"main_auto_approve": boolean,"max_agents": number,"notify_email": boolean,"onboarded": boolean,"telegram_chat_id": string | null,"token_budget_daily": number,"ui_mode": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "intent"?: string | null,"is_admin"?: boolean,"main_auto_approve"?: boolean,"max_agents"?: number,"notify_email"?: boolean,"onboarded"?: boolean,"telegram_chat_id"?: string | null,"token_budget_daily"?: number,"ui_mode"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "intent"?: string | null,"is_admin"?: boolean,"main_auto_approve"?: boolean,"max_agents"?: number,"notify_email"?: boolean,"onboarded"?: boolean,"telegram_chat_id"?: string | null,"token_budget_daily"?: number,"ui_mode"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_settings_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
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
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"id": string,"p256dh": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"id"?: string,"p256dh": string,"user_id": string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"p256dh"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reactions": {
                  Row: {
                    "created_at": string,"emoji": string,"message_id": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"emoji": string,"message_id": number,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"emoji"?: string,"message_id"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reactions_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reactions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reports": {
                  Row: {
                    "created_at": string,"id": number,"message_id": number | null,"reason": string,"reported_agent_id": string,"reporter_agent_id": string | null,"reporter_user_id": string | null,"resolved_at": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: never,"message_id"?: number | null,"reason": string,"reported_agent_id": string,"reporter_agent_id"?: string | null,"reporter_user_id"?: string | null,"resolved_at"?: string | null,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"message_id"?: number | null,"reason"?: string,"reported_agent_id"?: string,"reporter_agent_id"?: string | null,"reporter_user_id"?: string | null,"resolved_at"?: string | null,"status"?: string
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
                },"share_links": {
                  Row: {
                    "agent_id": string,"created_at": string,"expires_at": string | null,"id": string,"label": string,"max_uses": number | null,"revoked_at": string | null,"token_hash": string,"uses": number
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id": string,"created_at"?: string,"expires_at"?: string | null,"id"?: string,"label"?: string,"max_uses"?: number | null,"revoked_at"?: string | null,"token_hash": string,"uses"?: number
                  }
                  Update: {
                    "agent_id"?: string,"created_at"?: string,"expires_at"?: string | null,"id"?: string,"label"?: string,"max_uses"?: number | null,"revoked_at"?: string | null,"token_hash"?: string,"uses"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "share_links_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    }
                  ]
                },"subscriptions": {
                  Row: {
                    "agent_id": string,"chat_id": string,"created_at": string,"cursor": number,"id": string,"mode": string,"notified_at": string | null,"notified_cursor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id": string,"chat_id": string,"created_at"?: string,"cursor"?: number,"id"?: string,"mode"?: string,"notified_at"?: string | null,"notified_cursor"?: number
                  }
                  Update: {
                    "agent_id"?: string,"chat_id"?: string,"created_at"?: string,"cursor"?: number,"id"?: string,"mode"?: string,"notified_at"?: string | null,"notified_cursor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscriptions_chat_id_fkey"
      columns: ["chat_id"]
isOneToOne: false
      referencedRelation: "chats"
      referencedColumns: ["id"]
    }
                  ]
                },"task_presets": {
                  Row: {
                    "agent_id": string,"created_at": string,"enabled": boolean,"id": string,"instructions": string,"interval_minutes": number | null,"last_run_at": string | null,"next_run_at": string | null,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id": string,"created_at"?: string,"enabled"?: boolean,"id"?: string,"instructions": string,"interval_minutes"?: number | null,"last_run_at"?: string | null,"next_run_at"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "agent_id"?: string,"created_at"?: string,"enabled"?: boolean,"id"?: string,"instructions"?: string,"interval_minutes"?: number | null,"last_run_at"?: string | null,"next_run_at"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_presets_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_presets_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "agent_stats":
{ Args: { "p_handle": string }; Returns: Json
                           },
"bump_grant":
{ Args: { "p_grant": string,"p_messages"?: number,"p_tokens"?: number }; Returns: {
              "agent_id": string,
"blocked": boolean,
"connecting_agent_id": string | null,
"created_at": string,
"daily_messages": number | null,
"expires_at": string | null,
"grantee_id": string,
"id": string,
"last_used_at": string | null,
"messages_today": number,
"messages_used": number,
"revoked_at": string | null,
"role": string,
"token_budget": number | null,
"tokens_used": number,
"usage_day": string,
"via_link": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "agent_grants"
        isOneToOne: true
        isSetofReturn: false
      } },
"bump_usage":
{ Args: { "p_agent": string,"p_calls"?: number,"p_messages"?: number,"p_tokens"?: number }; Returns: {
              "agent_id": string,
"day": string,
"llm_calls": number,
"messages": number,
"tokens": number
            }
                          SetofOptions: {
        from: "*"
        to: "agent_usage"
        isOneToOne: true
        isSetofReturn: false
      } },
"chat_usage":
{ Args: { "p_chat": string }; Returns: {
              "est_tokens": number,"messages": number
            }[]
                           },
"claim_jobs":
{ Args: { "p_limit"?: number,"p_worker": string }; Returns: {
              "agent_id": string,
"attempts": number,
"chat_id": string | null,
"claimed_at": string | null,
"claimed_by": string | null,
"created_at": string,
"finished_at": string | null,
"id": number,
"kind": string,
"last_error": string | null,
"message_id": number | null,
"run_after": string,
"status": Database["public"]['Enums']["job_status"]
            }[]
                          SetofOptions: {
        from: "*"
        to: "jobs"
        isOneToOne: false
        isSetofReturn: true
      } },
"enqueue_due_publishers":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"freeze_chat":
{ Args: { "p_chat": string,"p_note"?: string,"p_reason": string }; Returns: undefined
                           },
"my_analytics":
{ Args: { "p_days"?: number }; Returns: Json
                           },
"my_chats":
{ Args: Record<PropertyKey, never>; Returns: {
              "frozen": boolean,"frozen_reason": string,"goal": string,"id": string,"is_public": boolean,"kind": Database["public"]['Enums']["chat_kind"],"last_body": Json,"last_kind": Database["public"]['Enums']["message_kind"],"last_message_at": string,"last_sender_agent_id": string,"last_sender_user_id": string,"last_text": string,"origin": Json,"request_state": string,"request_to": string,"status": Database["public"]['Enums']["task_status"],"title": string,"type": Database["public"]['Enums']["chat_type"]
            }[]
                           },
"owner_channel_previews":
{ Args: Record<PropertyKey, never>; Returns: {
              "chat_id": string,"latest_at": string,"latest_id": number,"new_posts": number,"title": string,"tldr": string
            }[]
                           },
"revoke_grant":
{ Args: { "p_block"?: boolean,"p_grant": string }; Returns: undefined
                           },
"run_due_presets":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"search_agents":
{ Args: { "lim"?: number,"q"?: string }; Returns: {
              "avatar_hue": number,
"bio": string,
"capabilities": (string)[],
"cold_contact_cap": number,
"created_at": string,
"daily_message_cap": number,
"daily_token_cap": number,
"guest_policy": NonNullable<Json>,
"handle": string,
"hosting": string,
"id": string,
"inbound_policy": Database["public"]['Enums']["inbound_policy"],
"is_main": boolean,
"is_public": boolean,
"max_tool_steps": number,
"model": string | null,
"name": string,
"owner_id": string,
"paused": boolean,
"public_key": string | null,
"rate_tier": number,
"runner_seen_at": string | null,
"search": unknown,
"updated_at": string,
"verified": boolean,
"visibility": Database["public"]['Enums']["agent_visibility"],
"webhook_url": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "agents"
        isOneToOne: false
        isSetofReturn: true
      } },
"search_messages":
{ Args: { "lim"?: number,"q": string }; Returns: {
              "chat_id": string,"created_at": string,"id": number,"kind": Database["public"]['Enums']["message_kind"],"text": string,"title": string
            }[]
                           },
"send_owner_message":
{ Args: { "p_attachment_ids": (string)[],"p_chat_id": string,"p_client_nonce": string,"p_text": string }; Returns: number
                           }
          }
          Enums: {
            "agent_visibility": "public"|"unlisted"|"private","approval_state": "pending"|"approved"|"declined"|"expired","chat_kind": "owner"|"agent","chat_type": "dm"|"group"|"task"|"channel","delivery_status": "pending"|"delivered"|"failed","inbound_policy": "anyone"|"verified"|"contacts"|"requests","job_status": "queued"|"running"|"done"|"failed","member_role": "owner"|"member"|"subscriber","message_kind": "text"|"request"|"offer"|"counter_offer"|"result"|"approval_needed"|"system"|"post","task_status": "open"|"waiting"|"done"|"failed"|"paused"
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
            "agent_visibility": ["public", "unlisted", "private"],"approval_state": ["pending", "approved", "declined", "expired"],"chat_kind": ["owner", "agent"],"chat_type": ["dm", "group", "task", "channel"],"delivery_status": ["pending", "delivered", "failed"],"inbound_policy": ["anyone", "verified", "contacts", "requests"],"job_status": ["queued", "running", "done", "failed"],"member_role": ["owner", "member", "subscriber"],"message_kind": ["text", "request", "offer", "counter_offer", "result", "approval_needed", "system", "post"],"task_status": ["open", "waiting", "done", "failed", "paused"]
          }
        }
} as const
