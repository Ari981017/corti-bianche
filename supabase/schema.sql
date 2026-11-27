-- Schema del database di Le Corti Bianche (riferimento).
-- È lo stato a cui deve corrispondere il progetto Supabase: tabelle,
-- regole RLS e storage. Da eseguire nell'SQL editor su un progetto nuovo.

-- Categorie (es. Freschi, Stagionati, Yogurt)
create table categories (
  id bigint generated always as identity primary key,
  name text not null,
  slug text not null unique,
  position int not null default 0
);

-- Prodotti
create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  price numeric(10,2) not null check (price >= 0),
  unit text not null default 'kg' check (unit in ('kg', 'etto', 'pezzo', 'confezione')),
  category_id bigint references categories(id) on delete set null,
  image_path text,
  is_available boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at automatico
create function set_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger products_updated_at before update on products
for each row execute function set_updated_at();

-- Admin: solo gli utenti in questa tabella possono modificare
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security; -- nessuna policy: dal client non si legge

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

-- RLS
alter table categories enable row level security;
alter table products enable row level security;

create policy "public read categories" on categories for select using (true);
create policy "admin write categories" on categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "public read available products" on products for select using (is_available = true);
create policy "admin all products" on products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Bucket pubblico per le foto (lettura tramite URL pubblico, nessuna policy di select)
insert into storage.buckets (id, name, public) values ('products', 'products', true);

create policy "admin upload images" on storage.objects
  for insert to authenticated with check (bucket_id = 'products' and public.is_admin());
create policy "admin update images" on storage.objects
  for update to authenticated using (bucket_id = 'products' and public.is_admin())
  with check (bucket_id = 'products' and public.is_admin());
create policy "admin delete images" on storage.objects
  for delete to authenticated using (bucket_id = 'products' and public.is_admin());

-- Dopo aver creato l'utente da Authentication → Users:
-- insert into public.admins (user_id) values ('UUID-DELL-UTENTE');
-- In Authentication → Sign In / Providers: disattivare le registrazioni e gli accessi anonimi.
