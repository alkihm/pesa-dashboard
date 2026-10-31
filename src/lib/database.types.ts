export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          operationName?: string;
          query?: string;
          variables?: Json;
          extensions?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      accounts: {
        Row: {
          archived_at: string | null;
          counts_in_net: boolean;
          created_at: string;
          debt_term: string | null;
          due_day: number | null;
          emoji: string | null;
          id: string;
          kind: string;
          limit_cents: number | null;
          name: string;
          original_cents: number | null;
          sms_account_hint: string | null;
          sms_sender: string | null;
          sort_order: number;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          archived_at?: string | null;
          counts_in_net: boolean;
          created_at?: string;
          debt_term?: string | null;
          due_day?: number | null;
          emoji?: string | null;
          id?: string;
          kind: string;
          limit_cents?: number | null;
          name: string;
          original_cents?: number | null;
          sms_account_hint?: string | null;
          sms_sender?: string | null;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Update: {
          archived_at?: string | null;
          counts_in_net?: boolean;
          created_at?: string;
          debt_term?: string | null;
          due_day?: number | null;
          emoji?: string | null;
          id?: string;
          kind?: string;
          limit_cents?: number | null;
          name?: string;
          original_cents?: number | null;
          sms_account_hint?: string | null;
          sms_sender?: string | null;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [];
      };
      balance_snapshots: {
        Row: {
          account_id: string;
          as_of: string;
          balance_cents: number;
          created_at: string;
          id: string;
          sms_id: string | null;
          source: string;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          account_id: string;
          as_of: string;
          balance_cents: number;
          created_at?: string;
          id?: string;
          sms_id?: string | null;
          source: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Update: {
          account_id?: string;
          as_of?: string;
          balance_cents?: number;
          created_at?: string;
          id?: string;
          sms_id?: string | null;
          source?: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "balance_snapshots_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "account_balances";
            referencedColumns: ["account_id"];
          },
          {
            foreignKeyName: "balance_snapshots_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "balance_snapshots_sms_id_fkey";
            columns: ["sms_id"];
            isOneToOne: false;
            referencedRelation: "sms_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      bill_months: {
        Row: {
          amount_cents: number;
          bill_id: string;
          created_at: string;
          due_on: string;
          id: string;
          month: string;
          paid_at: string | null;
          skip_reason: string | null;
          status: string;
          transaction_id: string | null;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          amount_cents: number;
          bill_id: string;
          created_at?: string;
          due_on: string;
          id?: string;
          month: string;
          paid_at?: string | null;
          skip_reason?: string | null;
          status?: string;
          transaction_id?: string | null;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Update: {
          amount_cents?: number;
          bill_id?: string;
          created_at?: string;
          due_on?: string;
          id?: string;
          month?: string;
          paid_at?: string | null;
          skip_reason?: string | null;
          status?: string;
          transaction_id?: string | null;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "bill_months_bill_id_fkey";
            columns: ["bill_id"];
            isOneToOne: false;
            referencedRelation: "bills";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bill_months_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      bills: {
        Row: {
          account_id: string | null;
          amount_cents: number;
          archived_at: string | null;
          category_id: string | null;
          created_at: string;
          due_day: number;
          emoji: string | null;
          id: string;
          name: string;
          payee_match: string | null;
          starts_on: string;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          account_id?: string | null;
          amount_cents: number;
          archived_at?: string | null;
          category_id?: string | null;
          created_at?: string;
          due_day: number;
          emoji?: string | null;
          id?: string;
          name: string;
          payee_match?: string | null;
          starts_on?: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Update: {
          account_id?: string | null;
          amount_cents?: number;
          archived_at?: string | null;
          category_id?: string | null;
          created_at?: string;
          due_day?: number;
          emoji?: string | null;
          id?: string;
          name?: string;
          payee_match?: string | null;
          starts_on?: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "bills_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "account_balances";
            referencedColumns: ["account_id"];
          },
          {
            foreignKeyName: "bills_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bills_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      budget_items: {
        Row: {
          account_id: string;
          amount_cents: number;
          approved_at: string | null;
          category_id: string | null;
          created_at: string;
          id: string;
          month: string;
          name: string;
          status: string;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          account_id: string;
          amount_cents: number;
          approved_at?: string | null;
          category_id?: string | null;
          created_at?: string;
          id?: string;
          month: string;
          name: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Update: {
          account_id?: string;
          amount_cents?: number;
          approved_at?: string | null;
          category_id?: string | null;
          created_at?: string;
          id?: string;
          month?: string;
          name?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "budget_items_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "account_balances";
            referencedColumns: ["account_id"];
          },
          {
            foreignKeyName: "budget_items_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "budget_items_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          archived_at: string | null;
          colour: string;
          created_at: string;
          emoji: string | null;
          id: string;
          kind: string;
          monthly_budget_cents: number | null;
          name: string;
          sort_order: number;
          system: boolean;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          archived_at?: string | null;
          colour: string;
          created_at?: string;
          emoji?: string | null;
          id?: string;
          kind: string;
          monthly_budget_cents?: number | null;
          name: string;
          sort_order?: number;
          system?: boolean;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Update: {
          archived_at?: string | null;
          colour?: string;
          created_at?: string;
          emoji?: string | null;
          id?: string;
          kind?: string;
          monthly_budget_cents?: number | null;
          name?: string;
          sort_order?: number;
          system?: boolean;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [];
      };
      import_batches: {
        Row: {
          created_at: string;
          file_name: string;
          id: string;
          row_count: number;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          file_name: string;
          id?: string;
          row_count?: number;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          file_name?: string;
          id?: string;
          row_count?: number;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [];
      };
      payee_rules: {
        Row: {
          category_id: string | null;
          created_at: string;
          id: string;
          pattern: string;
          priority: number;
          transfer_account_id: string | null;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          category_id?: string | null;
          created_at?: string;
          id?: string;
          pattern: string;
          priority?: number;
          transfer_account_id?: string | null;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Update: {
          category_id?: string | null;
          created_at?: string;
          id?: string;
          pattern?: string;
          priority?: number;
          transfer_account_id?: string | null;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "payee_rules_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payee_rules_transfer_account_id_fkey";
            columns: ["transfer_account_id"];
            isOneToOne: false;
            referencedRelation: "account_balances";
            referencedColumns: ["account_id"];
          },
          {
            foreignKeyName: "payee_rules_transfer_account_id_fkey";
            columns: ["transfer_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      pin_credentials: {
        Row: {
          created_at: string;
          failed_attempts: number;
          id: string;
          locked_until: string | null;
          pin_hash: string;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          failed_attempts?: number;
          id?: string;
          locked_until?: string | null;
          pin_hash: string;
          updated_at?: string;
          user_id: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          failed_attempts?: number;
          id?: string;
          locked_until?: string | null;
          pin_hash?: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          created_at: string;
          device_label: string | null;
          endpoint: string;
          id: string;
          keys: Json;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          device_label?: string | null;
          endpoint: string;
          id?: string;
          keys: Json;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          device_label?: string | null;
          endpoint?: string;
          id?: string;
          keys?: Json;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [];
      };
      review_checks: {
        Row: {
          account_id: string;
          created_at: string;
          id: string;
          ledger_cents: number;
          resolution: string;
          review_id: string;
          stated_cents: number | null;
          transaction_id: string | null;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          account_id: string;
          created_at?: string;
          id?: string;
          ledger_cents: number;
          resolution: string;
          review_id: string;
          stated_cents?: number | null;
          transaction_id?: string | null;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Update: {
          account_id?: string;
          created_at?: string;
          id?: string;
          ledger_cents?: number;
          resolution?: string;
          review_id?: string;
          stated_cents?: number | null;
          transaction_id?: string | null;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "review_checks_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "account_balances";
            referencedColumns: ["account_id"];
          },
          {
            foreignKeyName: "review_checks_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_checks_review_id_fkey";
            columns: ["review_id"];
            isOneToOne: false;
            referencedRelation: "reviews";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_checks_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          completed_at: string | null;
          created_at: string;
          id: string;
          note: string | null;
          result: string | null;
          started_at: string;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          result?: string | null;
          started_at?: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          result?: string | null;
          started_at?: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          alerts: Json;
          created_at: string;
          id: string;
          loan_allocation_pct: number;
          review_interval_days: number;
          theme: string;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          alerts?: Json;
          created_at?: string;
          id?: string;
          loan_allocation_pct?: number;
          review_interval_days?: number;
          theme?: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Update: {
          alerts?: Json;
          created_at?: string;
          id?: string;
          loan_allocation_pct?: number;
          review_interval_days?: number;
          theme?: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [];
      };
      sms_messages: {
        Row: {
          body: string;
          created_at: string;
          error: string | null;
          hash: string;
          id: string;
          parse_status: string;
          parser_version: string | null;
          received_at: string;
          sender: string;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          body: string;
          created_at?: string;
          error?: string | null;
          hash: string;
          id?: string;
          parse_status: string;
          parser_version?: string | null;
          received_at: string;
          sender: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Update: {
          body?: string;
          created_at?: string;
          error?: string | null;
          hash?: string;
          id?: string;
          parse_status?: string;
          parser_version?: string | null;
          received_at?: string;
          sender?: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          account_id: string;
          amount_cents: number;
          budget_item_id: string | null;
          category_id: string | null;
          channel: string | null;
          created_at: string;
          dedupe_key: string | null;
          deleted_at: string | null;
          deleted_reason: string | null;
          id: string;
          import_batch_id: string | null;
          kind: string;
          needs_review: boolean;
          note: string | null;
          occurred_at: string;
          original_currency: string | null;
          original_minor: number | null;
          parent_id: string | null;
          payee: string | null;
          reason: string | null;
          ref: string | null;
          sms_id: string | null;
          source: string;
          transfer_id: string | null;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          account_id: string;
          amount_cents: number;
          budget_item_id?: string | null;
          category_id?: string | null;
          channel?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          deleted_at?: string | null;
          deleted_reason?: string | null;
          id?: string;
          import_batch_id?: string | null;
          kind: string;
          needs_review?: boolean;
          note?: string | null;
          occurred_at: string;
          original_currency?: string | null;
          original_minor?: number | null;
          parent_id?: string | null;
          payee?: string | null;
          reason?: string | null;
          ref?: string | null;
          sms_id?: string | null;
          source: string;
          transfer_id?: string | null;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Update: {
          account_id?: string;
          amount_cents?: number;
          budget_item_id?: string | null;
          category_id?: string | null;
          channel?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          deleted_at?: string | null;
          deleted_reason?: string | null;
          id?: string;
          import_batch_id?: string | null;
          kind?: string;
          needs_review?: boolean;
          note?: string | null;
          occurred_at?: string;
          original_currency?: string | null;
          original_minor?: number | null;
          parent_id?: string | null;
          payee?: string | null;
          reason?: string | null;
          ref?: string | null;
          sms_id?: string | null;
          source?: string;
          transfer_id?: string | null;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "account_balances";
            referencedColumns: ["account_id"];
          },
          {
            foreignKeyName: "transactions_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_budget_item_id_fkey";
            columns: ["budget_item_id"];
            isOneToOne: false;
            referencedRelation: "budget_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_import_batch_id_fkey";
            columns: ["import_batch_id"];
            isOneToOne: false;
            referencedRelation: "import_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_sms_id_fkey";
            columns: ["sms_id"];
            isOneToOne: false;
            referencedRelation: "sms_messages";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      account_balances: {
        Row: {
          account_id: string | null;
          balance_cents: number | null;
          counts_in_net: boolean | null;
          debt_term: string | null;
          difference_cents: number | null;
          kind: string | null;
          last_activity: string | null;
          name: string | null;
          snapshot_at: string | null;
          snapshot_cents: number | null;
          user_id: string | null;
        };
        Relationships: [];
      };
      category_month_totals: {
        Row: {
          category_id: string | null;
          kind: string | null;
          month: string | null;
          total_cents: number | null;
          transaction_count: number | null;
          user_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      month_totals: {
        Row: {
          borrowed_cents: number | null;
          fees_cents: number | null;
          income_cents: number | null;
          month: string | null;
          repaid_cents: number | null;
          saved_cents: number | null;
          spending_cents: number | null;
          user_id: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      ensure_bill_months: {
        Args: {
          p_month: string;
        };
        Returns: {
          amount_cents: number;
          bill_id: string;
          created_at: string;
          due_on: string;
          id: string;
          month: string;
          paid_at: string | null;
          skip_reason: string | null;
          status: string;
          transaction_id: string | null;
          updated_at: string;
          user_id: string;
          version: number;
        }[];
      };
      ingest_sms: {
        Args: {
          p_user_id: string;
          p_sender: string;
          p_body: string;
          p_received_at: string;
          p_hash: string;
          p_status: string;
          p_error: string;
          p_parser_version: string;
          p_rows?: Json;
          p_snapshots?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DefaultSchema = Database[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof Database },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof Database },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof Database },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof Database },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] | { schema: keyof Database },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
