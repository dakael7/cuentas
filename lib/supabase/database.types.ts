export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
type Table<Row, Insert = Partial<Row>, Update = Partial<Insert>> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };
type Profile = { id: string; display_name: string | null; currency: string; bonus_day: number; privacy_mode: boolean; created_at: string; updated_at: string };
type BudgetMonth = { id: string; user_id: string; month: string; income_15: number; income_30: number; bonus_income: number; bonus_date: string | null; needs_target: number; wants_target: number; savings_target: number; debts_target: number };
type Category = { id: string; user_id: string; name: string; group_name: string; archived: boolean };
type BudgetItem = { id: string; user_id: string; budget_month_id: string; category_id: string; amount: number; percent: number; pay_source: string };
type Transaction = { id: string; user_id: string; happened_on: string; amount_original: number; currency: string; rate_applied: number | null; rate_date: string | null; amount_usd: number | null; amount_ves: number | null; rate_is_manual: boolean; category_id: string | null; note: string | null; payment_method: string | null; pay_source: string };
type Debt = { id: string; user_id: string; name: string; creditor: string | null; debt_type: string; total_amount: number; initial_amount: number; installment: number; remaining_payments: number; pay_source: string; starts_on: string | null; next_due_date: string | null; interest_rate: number | null; notes: string | null };
type DebtPayment = { id: string; user_id: string; debt_id: string; due_date: string; amount: number; status: string; transaction_id: string | null };
type CasheaSimulation = { id: string; user_id: string; purchase_amount: number; down_payment_percent: number; installments: number; available_credit: number | null; result: Json; created_at: string };
type SavingsGoal = { id: string; user_id: string; name: string; target_amount: number; current_amount: number; target_date: string | null };
type ExchangeRate = { rate_date: string; currency: string; rate: number; source: string; fetched_at: string };

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile, { id: string; display_name?: string | null; currency?: string; bonus_day?: number; privacy_mode?: boolean }>;
      budget_months: Table<BudgetMonth, { user_id: string; month: string; income_15?: number; income_30?: number; bonus_income?: number; bonus_date?: string | null; needs_target?: number; wants_target?: number; savings_target?: number; debts_target?: number }>;
      categories: Table<Category, { user_id: string; name: string; group_name: string; archived?: boolean }>;
      budget_items: Table<BudgetItem, { user_id: string; budget_month_id: string; category_id: string; amount?: number; percent?: number; pay_source?: string }>;
      transactions: Table<Transaction, { user_id: string; happened_on: string; amount_original: number; currency: string; rate_applied?: number | null; rate_date?: string | null; amount_usd?: number | null; amount_ves?: number | null; rate_is_manual?: boolean; category_id?: string | null; note?: string | null; payment_method?: string | null; pay_source?: string }>;
      debts: Table<Debt, { user_id: string; name: string; creditor?: string | null; debt_type: string; total_amount?: number; initial_amount?: number; installment: number; remaining_payments: number; pay_source?: string; starts_on?: string | null; next_due_date?: string | null; interest_rate?: number | null; notes?: string | null }>;
      debt_payments: Table<DebtPayment, { user_id: string; debt_id: string; due_date: string; amount: number; status?: string; transaction_id?: string | null }>;
      cashea_simulations: Table<CasheaSimulation, { user_id: string; purchase_amount: number; down_payment_percent: number; installments: number; available_credit?: number | null; result?: Json }>;
      savings_goals: Table<SavingsGoal, { user_id: string; name: string; target_amount: number; current_amount?: number; target_date?: string | null }>;
      exchange_rates: Table<ExchangeRate, { rate_date: string; currency?: string; rate: number; source: string; fetched_at?: string }>;
      exchange_rate_alerts: Table<{ id: string; rate_date: string; message: string; created_at: string }, { rate_date: string; message: string }>;
    };
    Views: Record<string, never>;
    Functions: { get_rate: { Args: { d: string }; Returns: number | null } };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
