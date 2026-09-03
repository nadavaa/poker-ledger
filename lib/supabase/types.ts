// Database types matching supabase/migrations. Regenerate with:
//   npx supabase gen types typescript --project-id <ref> --schema public > lib/supabase/types.ts
// once the Supabase CLI is linked to the project.

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
      profiles: {
        Row: {
          id: string
          display_name: string
          avatar_url: string | null
          venmo_handle: string | null
          created_at: string
          onboarding_completed_at: string | null
        }
        Insert: {
          id: string
          display_name: string
          avatar_url?: string | null
          venmo_handle?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          display_name?: string
          avatar_url?: string | null
          venmo_handle?: string | null
          created_at?: string
        }
        Relationships: []
      }
      groups: {
        Row: {
          id: string
          name: string
          invite_code: string
          avatar_url: string | null
          chips_per_dollar: number
          default_buyin_cents: number
          default_seat_limit: number
          timezone: string
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          invite_code?: string
          avatar_url?: string | null
          chips_per_dollar?: number
          default_buyin_cents?: number
          default_seat_limit?: number
          timezone?: string
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          invite_code?: string
          avatar_url?: string | null
          chips_per_dollar?: number
          default_buyin_cents?: number
          default_seat_limit?: number
          timezone?: string
          created_by?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'groups_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      group_members: {
        Row: {
          id: string
          group_id: string
          profile_id: string | null
          display_name: string
          role: Database['public']['Enums']['member_role']
          claim_code: string | null
          venmo_handle: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          group_id: string
          profile_id?: string | null
          display_name: string
          role?: Database['public']['Enums']['member_role']
          claim_code?: string | null
          venmo_handle?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          profile_id?: string | null
          display_name?: string
          role?: Database['public']['Enums']['member_role']
          claim_code?: string | null
          venmo_handle?: string | null
          is_active?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'group_members_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_members_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      games: {
        Row: {
          id: string
          group_id: string
          name: string | null
          scheduled_at: string
          location: string | null
          seat_limit: number
          default_buyin_cents: number
          chips_per_dollar: number
          status: Database['public']['Enums']['game_status']
          admin_member_id: string
          created_at: string
          created_by_member_id: string
          started_at: string | null
          settled_at: string | null
        }
        Insert: {
          id?: string
          group_id: string
          name?: string | null
          scheduled_at: string
          location?: string | null
          seat_limit?: number
          default_buyin_cents: number
          chips_per_dollar: number
          status?: Database['public']['Enums']['game_status']
          admin_member_id: string
          created_at?: string
          created_by_member_id: string
          started_at?: string | null
          settled_at?: string | null
        }
        Update: {
          id?: string
          group_id?: string
          name?: string | null
          scheduled_at?: string
          location?: string | null
          seat_limit?: number
          default_buyin_cents?: number
          chips_per_dollar?: number
          status?: Database['public']['Enums']['game_status']
          admin_member_id?: string
          created_at?: string
          created_by_member_id?: string
          started_at?: string | null
          settled_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'games_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'games_admin_member_id_fkey'
            columns: ['admin_member_id']
            isOneToOne: false
            referencedRelation: 'group_members'
            referencedColumns: ['id']
          },
        ]
      }
      game_signups: {
        Row: {
          id: string
          game_id: string
          member_id: string
          status: Database['public']['Enums']['signup_status']
          signup_order: number
          created_at: string
          withdrawn_at: string | null
        }
        Insert: {
          id?: string
          game_id: string
          member_id: string
          status?: Database['public']['Enums']['signup_status']
          signup_order?: number
          created_at?: string
          withdrawn_at?: string | null
        }
        Update: {
          id?: string
          game_id?: string
          member_id?: string
          status?: Database['public']['Enums']['signup_status']
          signup_order?: number
          created_at?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'game_signups_game_id_fkey'
            columns: ['game_id']
            isOneToOne: false
            referencedRelation: 'games'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'game_signups_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'group_members'
            referencedColumns: ['id']
          },
        ]
      }
      buyins: {
        Row: {
          id: string
          game_id: string
          member_id: string
          amount_cents: number
          chips: number
          note: string | null
          created_at: string
          created_by_member_id: string
          voided_at: string | null
          voided_by_member_id: string | null
          void_reason: string | null
        }
        Insert: {
          id?: string
          game_id: string
          member_id: string
          amount_cents: number
          chips: number
          note?: string | null
          created_at?: string
          // Stamped by trigger; never sent by the client.
          created_by_member_id?: string
          voided_at?: string | null
          voided_by_member_id?: string | null
          void_reason?: string | null
        }
        Update: {
          // Only the void transition is permitted, and the trigger stamps
          // voided_at / voided_by_member_id itself.
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'buyins_game_id_fkey'
            columns: ['game_id']
            isOneToOne: false
            referencedRelation: 'games'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'buyins_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'group_members'
            referencedColumns: ['id']
          },
        ]
      }
      game_admin_transfers: {
        Row: {
          id: string
          game_id: string
          from_member_id: string
          to_member_id: string
          transferred_by_member_id: string
          was_forced: boolean
          reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          game_id: string
          from_member_id: string
          to_member_id: string
          transferred_by_member_id: string
          was_forced?: boolean
          reason?: string | null
          created_at?: string
        }
        Update: {
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'game_admin_transfers_game_id_fkey'
            columns: ['game_id']
            isOneToOne: false
            referencedRelation: 'games'
            referencedColumns: ['id']
          },
        ]
      }
      game_edits: {
        Row: {
          id: string
          game_id: string
          edited_by_member_id: string | null
          field: string
          old_value: string | null
          new_value: string | null
          created_at: string
        }
        Insert: {
          id?: string
          game_id: string
          edited_by_member_id?: string | null
          field: string
          old_value?: string | null
          new_value?: string | null
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      cashouts: {
        Row: {
          id: string
          game_id: string
          member_id: string
          chips: number
          amount_cents: number
          recorded_at: string
          recorded_by_member_id: string
          left_table: boolean
        }
        Insert: {
          id?: string
          game_id: string
          member_id: string
          chips: number
          amount_cents: number
          recorded_at?: string
          recorded_by_member_id: string
          left_table?: boolean
        }
        Update: {
          chips?: number
          amount_cents?: number
        }
        Relationships: []
      }
      game_adjustments: {
        Row: {
          id: string
          game_id: string
          member_id: string | null
          amount_cents: number
          reason: string
          created_at: string
          created_by_member_id: string
        }
        Insert: {
          id?: string
          game_id: string
          member_id?: string | null
          amount_cents: number
          reason: string
          created_at?: string
          created_by_member_id: string
        }
        Update: {
          reason?: string
        }
        Relationships: []
      }
      food_orders: {
        Row: {
          id: string
          game_id: string
          paid_by_member_id: string
          description: string | null
          total_cents: number
          created_by_member_id: string
          created_at: string
        }
        Insert: {
          id?: string
          game_id: string
          paid_by_member_id: string
          description?: string | null
          total_cents: number
          created_by_member_id: string
          created_at?: string
        }
        Update: {
          description?: string | null
          total_cents?: number
          paid_by_member_id?: string
        }
        Relationships: []
      }
      food_order_shares: {
        Row: {
          id: string
          food_order_id: string
          member_id: string
          share_cents: number
          is_fixed: boolean
        }
        Insert: {
          id?: string
          food_order_id: string
          member_id: string
          share_cents: number
          is_fixed?: boolean
        }
        Update: {
          share_cents?: number
          is_fixed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'food_order_shares_food_order_id_fkey'
            columns: ['food_order_id']
            isOneToOne: false
            referencedRelation: 'food_orders'
            referencedColumns: ['id']
          },
        ]
      }
      settlements: {
        Row: {
          id: string
          game_id: string
          from_member_id: string
          to_member_id: string
          amount_cents: number
          status: Database['public']['Enums']['settlement_status']
          paid_at: string | null
          confirmed_at: string | null
          confirmed_by_member_id: string | null
          created_at: string
          kind: Database['public']['Enums']['settlement_kind']
          food_order_id: string | null
        }
        Insert: {
          id?: string
          game_id: string
          from_member_id: string
          to_member_id: string
          amount_cents: number
          status?: Database['public']['Enums']['settlement_status']
          paid_at?: string | null
          confirmed_at?: string | null
          created_at?: string
        }
        Update: {
          status?: Database['public']['Enums']['settlement_status']
          paid_at?: string | null
          confirmed_at?: string | null
          confirmed_by_member_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      game_player_totals: {
        Row: {
          game_id: string
          group_id: string
          member_id: string
          display_name: string
          buyin_cents: number
          buyin_chips: number
          buyin_count: number
          cashout_cents: number | null
          cashout_chips: number | null
          adjustment_cents: number
          net_cents: number
        }
        Relationships: []
      }
      member_lifetime: {
        Row: {
          group_id: string
          member_id: string
          display_name: string
          games_played: number
          lifetime_net_cents: number
        }
        Relationships: []
      }
    }
    Functions: {
      my_member_id: {
        Args: { gid: string }
        Returns: string | null
      }
      is_group_member: {
        Args: { gid: string }
        Returns: boolean
      }
      is_group_owner_or_admin: {
        Args: { gid: string }
        Returns: boolean
      }
      create_group: {
        Args: { group_name: string }
        Returns: string
      }
      join_group_by_invite: {
        Args: { code: string }
        Returns: string
      }
      claim_member: {
        Args: { code: string }
        Returns: string
      }
      group_preview_by_invite: {
        Args: { code: string }
        Returns: {
          group_id: string
          group_name: string
          member_count: number
          my_member_status: 'active' | 'inactive' | null
        }[]
      }
      member_preview_by_claim: {
        Args: { code: string }
        Returns: {
          member_name: string
          group_name: string
          already_claimed: boolean
        }[]
      }
      can_admin_game: {
        Args: { g: string }
        Returns: boolean
      }
      create_game: {
        Args: {
          p_scheduled_at: string
          p_group_id?: string | null
          p_new_group_name?: string | null
          p_name?: string | null
          p_location?: string | null
          p_seat_limit?: number | null
          p_buyin_cents?: number | null
          p_chips_per_dollar?: number | null
          p_playing?: boolean
        }
        Returns: string
      }
      cents_to_chips: {
        Args: { p_cents: number; p_chips_per_dollar: number }
        Returns: number
      }
      chips_to_cents: {
        Args: { p_chips: number; p_chips_per_dollar: number }
        Returns: number
      }
      game_nets: {
        Args: { p_game_id: string }
        Returns: {
          member_id: string
          display_name: string
          buyin_cents: number
          cashout_cents: number
          adjustment_cents: number
          net_cents: number
          has_cashout: boolean
        }[]
      }
      begin_reconciliation: {
        Args: { p_game_id: string }
        Returns: undefined
      }
      reopen_game: {
        Args: { p_game_id: string }
        Returns: undefined
      }
      record_cashout: {
        Args: { p_game_id: string; p_member_id: string; p_chips: number }
        Returns: undefined
      }
      join_game_by_link: {
        Args: { p_game_id: string }
        Returns: {
          group_id: string
          group_name: string
          game_name: string | null
          scheduled_at: string
          game_status: string
          outcome: string
          waitlist_position: number | null
        }[]
      }
      undo_cashout: {
        Args: { p_game_id: string; p_member_id: string }
        Returns: undefined
      }
      resolve_discrepancy: {
        Args: {
          p_game_id: string
          p_mode: string
          p_member_id?: string | null
          p_reason?: string | null
        }
        Returns: undefined
      }
      settle_game: {
        Args: { p_game_id: string; p_transfers: Json }
        Returns: number
      }
      shares_a_group_with: {
        Args: { pid: string }
        Returns: boolean
      }
      complete_onboarding: {
        Args: Record<string, never>
        Returns: undefined
      }
      normalize_us_phone: {
        Args: { raw: string }
        Returns: string | null
      }
      my_payment_details: {
        Args: Record<string, never>
        Returns: {
          venmo_handle: string | null
          phone_number: string | null
          preferred_payment_method: string | null
        }[]
      }
      set_my_payment_details: {
        Args: {
          p_venmo_handle: string | null
          p_phone: string | null
          p_preferred: string | null
        }
        Returns: undefined
      }
      game_payment_details: {
        Args: { p_game_id: string }
        Returns: {
          settlement_id: string
          payee_member_id: string
          member_venmo: string | null
          profile_venmo: string | null
          member_phone: string | null
          profile_phone: string | null
          preferred: string | null
        }[]
      }
      set_my_venmo_handle: {
        Args: { p_handle: string }
        Returns: undefined
      }
      member_has_history: {
        Args: { mid: string }
        Returns: boolean
      }
      member_removal_block: {
        Args: { mid: string }
        Returns: string | null
      }
      member_removal_preview: {
        Args: { p_member_id: string }
        Returns: {
          mode: string
          blocked_reason: string | null
          games_played: number
          display_name: string
        }[]
      }
      remove_group_member: {
        Args: { p_member_id: string }
        Returns: string
      }
      reactivate_group_member: {
        Args: { p_member_id: string }
        Returns: undefined
      }
      set_member_role: {
        Args: {
          p_member_id: string
          p_role: Database['public']['Enums']['member_role']
        }
        Returns: undefined
      }
      save_food_order: {
        Args: {
          p_game_id: string
          p_order_id: string | null
          p_paid_by: string
          p_description: string | null
          p_total_cents: number
          p_shares: Json
        }
        Returns: string
      }
      food_order_confirmed_payers: {
        Args: { p_order_id: string }
        Returns: { display_name: string; amount_cents: number }[]
      }
      delete_food_order: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      can_withdraw_from_game: {
        Args: { gid: string; mid: string }
        Returns: boolean
      }
      can_see_food_order: {
        Args: { oid: string }
        Returns: boolean
      }
      can_edit_food_order: {
        Args: { oid: string }
        Returns: boolean
      }
      delete_group: {
        Args: { p_group_id: string }
        Returns: undefined
      }
      group_delete_preview: {
        Args: { p_group_id: string }
        Returns: {
          members: number
          games: number
          open_settlements: number
        }[]
      }
      is_group_owner: {
        Args: { gid: string }
        Returns: boolean
      }
      game_settlement_progress: {
        Args: { p_game_id: string }
        Returns: { total: number; confirmed: number }[]
      }
      cancel_game: {
        Args: { p_game_id: string }
        Returns: undefined
      }
      promote_to_confirmed: {
        Args: {
          p_game_id: string
          p_member_id: string
          p_allow_overfill?: boolean
        }
        Returns: string
      }
      demote_from_confirmed: {
        Args: { p_game_id: string; p_member_id: string; p_to?: string }
        Returns: string
      }
      add_player_to_game: {
        Args: {
          p_game_id: string
          p_member_id?: string | null
          p_guest_name?: string | null
        }
        Returns: string
      }
      start_game: {
        Args: { p_game_id: string; p_member_ids?: string[] }
        Returns: undefined
      }
      transfer_game_admin: {
        Args: {
          p_game_id: string
          p_to_member_id: string
          p_reason?: string | null
        }
        Returns: undefined
      }
    }
    Enums: {
      settlement_status: 'pending' | 'paid' | 'confirmed' | 'deferred'
      settlement_kind: 'poker' | 'food'
      member_role: 'owner' | 'admin' | 'member'
      game_status:
        | 'scheduled'
        | 'active'
        | 'reconciling'
        | 'settled'
        | 'cancelled'
      signup_status: 'confirmed' | 'waitlist' | 'withdrawn'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T]
