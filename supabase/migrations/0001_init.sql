-- Cuentas: esquema inicial idempotente. Ejecutar en Supabase SQL Editor.
create extension if not exists pgcrypto;
do $$ begin create type public.budget_group as enum ('Necesidades','Deseos','Ahorro','Deudas'); exception when duplicate_object then null; end $$;
do $$ begin create type public.pay_source as enum ('Día 15','Día 30','Mitad y mitad','Bono','Cada quincena'); exception when duplicate_object then null; end $$;
do $$ begin create type public.debt_type as enum ('Cashea','Personal'); exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_status as enum ('pendiente','pagada','omitida'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text, currency text not null default 'USD' check (currency in ('USD','VES')),
  bonus_day smallint not null default 7 check (bonus_day between 1 and 31), privacy_mode boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.budget_months (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  month date not null, income_15 numeric(14,2) not null default 0 check (income_15 >= 0), income_30 numeric(14,2) not null default 0 check (income_30 >= 0),
  bonus_income numeric(14,2) not null default 0 check (bonus_income >= 0), bonus_date date,
  needs_target numeric(5,2) not null default 45 check (needs_target between 0 and 100), wants_target numeric(5,2) not null default 25 check (wants_target between 0 and 100),
  savings_target numeric(5,2) not null default 15 check (savings_target between 0 and 100), debts_target numeric(5,2) not null default 15 check (debts_target between 0 and 100),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id, month)
);
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, group_name public.budget_group not null, archived boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id, name)
);
create table if not exists public.budget_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  budget_month_id uuid not null references public.budget_months(id) on delete cascade, category_id uuid not null references public.categories(id),
  amount numeric(14,2) not null default 0 check (amount >= 0), percent numeric(5,2) not null default 0 check (percent between 0 and 100), pay_source public.pay_source not null default 'Mitad y mitad',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(budget_month_id, category_id)
);
create table if not exists public.exchange_rates (
  rate_date date not null, currency text not null default 'USD' check (currency = 'USD'), rate numeric(18,6) not null check (rate > 0),
  source text not null check (source in ('bcv','dolarapi','manual')), fetched_at timestamptz not null default now(), primary key(rate_date, currency)
);
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  happened_on date not null default current_date, amount_original numeric(14,2) not null check (amount_original >= 0), currency text not null default 'VES' check (currency in ('VES','USD')),
  rate_applied numeric(18,6), rate_date date, amount_usd numeric(14,2), amount_ves numeric(14,2), rate_is_manual boolean not null default false,
  category_id uuid references public.categories(id) on delete set null, note text, payment_method text, pay_source public.pay_source not null default 'Día 15',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, name text not null, creditor text,
  debt_type public.debt_type not null, total_amount numeric(14,2) not null default 0 check (total_amount >= 0), initial_amount numeric(14,2) not null default 0 check (initial_amount >= 0), installment numeric(14,2) not null check (installment >= 0), remaining_payments integer not null check (remaining_payments >= 0),
  pay_source public.pay_source not null default 'Cada quincena', starts_on date, next_due_date date, interest_rate numeric(7,4) check (interest_rate is null or interest_rate >= 0), notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.debts add column if not exists total_amount numeric(14,2) not null default 0 check (total_amount >= 0);
alter table public.debts add column if not exists initial_amount numeric(14,2) not null default 0 check (initial_amount >= 0);
create table if not exists public.debt_payments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  debt_id uuid not null references public.debts(id) on delete cascade, due_date date not null, amount numeric(14,2) not null check (amount >= 0),
  status public.payment_status not null default 'pendiente', transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(debt_id, due_date)
);
create table if not exists public.cashea_simulations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  purchase_amount numeric(14,2) not null check (purchase_amount >= 0), down_payment_percent numeric(5,2) not null check (down_payment_percent between 0 and 100),
  installments integer not null check (installments > 0), available_credit numeric(14,2), result jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, name text not null,
  target_amount numeric(14,2) not null check (target_amount > 0), current_amount numeric(14,2) not null default 0 check (current_amount >= 0), target_date date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.exchange_rate_alerts (
  id uuid primary key default gen_random_uuid(), rate_date date not null, message text not null, created_at timestamptz not null default now()
);

create or replace function public.get_rate(d date) returns numeric(18,6) language sql stable security invoker set search_path = '' as $$
  select r.rate from public.exchange_rates r where r.currency = 'USD' and r.rate_date <= d order by r.rate_date desc limit 1
$$;
create or replace function public.fill_transaction_fx() returns trigger language plpgsql security definer set search_path = '' as $$
declare selected_rate numeric(18,6);
declare selected_rate_date date;
begin
  if new.rate_is_manual and new.rate_applied is not null and (tg_op = 'INSERT' or new.happened_on = old.happened_on) then
    selected_rate := new.rate_applied;
    selected_rate_date := new.happened_on;
  else
    select r.rate, r.rate_date into selected_rate, selected_rate_date
      from public.exchange_rates r
      where r.currency = 'USD' and r.rate_date <= new.happened_on
      order by r.rate_date desc limit 1;
    new.rate_is_manual := false;
  end if;
  if selected_rate is null then raise exception 'No existe una tasa de cambio para la fecha %', new.happened_on; end if;
  new.rate_applied := selected_rate;
  new.rate_date := selected_rate_date;
  new.amount_ves := case when new.currency = 'VES' then new.amount_original else round(new.amount_original * selected_rate, 2) end;
  new.amount_usd := case when new.currency = 'USD' then new.amount_original else round(new.amount_original / selected_rate, 2) end;
  return new;
end $$;
drop trigger if exists transactions_fx_snapshot on public.transactions;
create trigger transactions_fx_snapshot before insert or update of happened_on, amount_original, currency, rate_applied, rate_is_manual on public.transactions for each row execute function public.fill_transaction_fx();

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
do $$ declare t text; begin foreach t in array array['profiles','budget_months','categories','budget_items','transactions','debts','debt_payments','savings_goals'] loop
  execute format('drop trigger if exists touch_updated_at on public.%I', t);
  execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t);
end loop; end $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name) values(new.id, coalesce(new.raw_user_meta_data->>'name','')) on conflict(id) do nothing;
  insert into public.categories(user_id,name,group_name) values
    (new.id,'Vivienda','Necesidades'),(new.id,'Alimentación','Necesidades'),(new.id,'Transporte','Necesidades'),(new.id,'Servicios','Necesidades'),(new.id,'Salud','Necesidades'),(new.id,'Salidas y ocio','Deseos'),(new.id,'Comer fuera','Deseos'),(new.id,'Compras','Deseos'),(new.id,'Suscripciones','Deseos'),(new.id,'Imprevistos','Necesidades'),(new.id,'Fondo de emergencia','Ahorro'),(new.id,'Metas','Ahorro'),(new.id,'Inversión','Ahorro'),(new.id,'Cuotas de deudas','Deudas') on conflict(user_id,name) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create index if not exists transactions_user_date_idx on public.transactions(user_id, happened_on desc);
create index if not exists debts_user_due_idx on public.debts(user_id, next_due_date);
create index if not exists debt_payments_user_date_idx on public.debt_payments(user_id, due_date);
create index if not exists rates_date_idx on public.exchange_rates(rate_date desc);
create index if not exists budget_months_user_month_idx on public.budget_months(user_id, month desc);

-- RLS con control por fila; las tasas son compartidas y de solo lectura para usuarios.
do $$ declare t text; begin foreach t in array array['budget_months','categories','budget_items','transactions','debts','debt_payments','cashea_simulations','savings_goals'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists user_owns_rows on public.%I', t);
  execute format('create policy user_owns_rows on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
end loop; end $$;
alter table public.profiles enable row level security;
drop policy if exists user_owns_rows on public.profiles;
create policy user_owns_rows on public.profiles for all to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter table public.exchange_rates enable row level security;
drop policy if exists authenticated_read_rates on public.exchange_rates;
create policy authenticated_read_rates on public.exchange_rates for select to authenticated using (true);
revoke insert, update, delete on public.exchange_rates from anon, authenticated;
alter table public.exchange_rate_alerts enable row level security;
drop policy if exists authenticated_read_rate_alerts on public.exchange_rate_alerts;
create policy authenticated_read_rate_alerts on public.exchange_rate_alerts for select to authenticated using (true);
revoke insert, update, delete on public.exchange_rate_alerts from anon, authenticated;

comment on table public.exchange_rates is 'Tasas oficiales diarias compartidas. Escritura exclusiva del servidor con service role.';
comment on function public.get_rate(date) is 'Devuelve la última tasa USD vigente en o antes de la fecha solicitada.';
comment on column public.transactions.rate_applied is 'Snapshot histórico; no cambia si se actualizan tasas posteriores.';
