-- ─── Run this in Supabase → SQL Editor ──────────────────────────

-- 1. Site images table
create table if not exists public.site_images (
  slot         text primary key,          -- e.g. "hero-1", "gallery-3"
  url          text not null,             -- public storage URL
  storage_path text not null,             -- path inside the bucket
  alt          text default '',
  updated_at   timestamptz default now()
);

-- 2. Row-level security
alter table public.site_images enable row level security;

create policy "Public read"
  on public.site_images for select
  to anon, authenticated
  using (true);

create policy "Authenticated write"
  on public.site_images for all
  to authenticated
  using (true)
  with check (true);

-- 3. Auto-update timestamp
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger site_images_updated_at
  before update on public.site_images
  for each row execute function public.set_updated_at();

-- ─── Storage bucket ─────────────────────────────────────────────
-- Run this separately in Supabase → Storage → New bucket:
--   Name: site-images
--   Public: YES (toggle on)
--
-- Then add these storage policies in Storage → site-images → Policies:
--
-- Policy 1 (SELECT — public read):
--   CREATE POLICY "Public read" ON storage.objects
--   FOR SELECT USING (bucket_id = 'site-images');
--
-- Policy 2 (INSERT — authenticated upload):
--   CREATE POLICY "Auth upload" ON storage.objects
--   FOR INSERT TO authenticated
--   WITH CHECK (bucket_id = 'site-images');
--
-- Policy 3 (UPDATE — authenticated replace):
--   CREATE POLICY "Auth update" ON storage.objects
--   FOR UPDATE TO authenticated
--   USING (bucket_id = 'site-images');
--
-- Policy 4 (DELETE — authenticated delete):
--   CREATE POLICY "Auth delete" ON storage.objects
--   FOR DELETE TO authenticated
--   USING (bucket_id = 'site-images');
