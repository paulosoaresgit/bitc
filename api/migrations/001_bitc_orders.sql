-- Apply to the dedicated BITC Supabase project before enabling checkout.
-- Only the payment API (service-role key) may read/write orders.
create table if not exists public.bitc_orders (
  id uuid primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending','invoice_created','processing','settled','expired','invalid')),
  currency text not null default 'USD' check (currency = 'USD'),
  amount_cents bigint not null check (amount_cents > 0),
  items jsonb not null,
  shipping_method text not null,
  shipping_protection boolean not null default false,
  customer jsonb not null,
  invoice_id text unique
);
create index if not exists bitc_orders_status_created_idx on public.bitc_orders(status, created_at desc);
alter table public.bitc_orders enable row level security;
revoke all privileges on table public.bitc_orders from anon, authenticated;
-- No anon/authenticated RLS policies. Service-role operations are backend-only.
