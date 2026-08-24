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
          chips_per_dollar: number
          default_buyin_cents: number
          default_seat_limit: number
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          invite_code?: string
          chips_per_dollar?: number
          default_buyin_cents?: number
          default_seat_limit?: number
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          invite_code?: string
          chips_per_dollar?: number
          default_buyin_cents?: number
          default_seat_limit?: number
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
    }
    Views: {
      [_ in never]: never
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
    }
    Enums: {
      member_role: 'owner' | 'admin' | 'member'
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
