-- ============================================================
-- MOOD V4 - Multi Branch Foundation
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- Branches
-- ============================================================

create table if not exists public.branches (
    id uuid primary key default gen_random_uuid(),

    code text not null unique,
    name text not null,

    logo_url text,

    primary_color text default '#16a34a',
    secondary_color text default '#ffffff',

    phone text,
    whatsapp_number text,
    email text,
    address text,

    invoice_prefix text not null,

    currency text default 'LYD',
    timezone text default 'Africa/Tripoli',

    is_active boolean default true,

    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- ============================================================
-- Branch Settings
-- ============================================================

create table if not exists public.branch_settings (

    id uuid primary key default gen_random_uuid(),

    branch_id uuid not null
        references public.branches(id)
        on delete cascade,

    invoice_title text,
    invoice_footer text,

    printer_name text,

    whatsapp_instance text,
    whatsapp_token text,

    bank_name text,
    bank_account text,
    iban text,

    auto_print_customer_invoice boolean default true,
    auto_print_production_invoice boolean default true,

    created_at timestamptz default now(),
    updated_at timestamptz default now(),

    unique(branch_id)
);

-- ============================================================
-- Default Branch
-- ============================================================

insert into public.branches
(
    code,
    name,
    invoice_prefix
)
values
(
    'MAIN',
    'MOOD',
    'MN'
)
on conflict (code) do nothing;