-- Public assets for the texting agent — currently just oliv.vcf, the contact
-- card (name + logo) users save so the thread shows "Oliv" instead of a bare
-- number. Uploaded by scripts/make-oliv-vcard.mjs at deploy time.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'agent-assets', 'agent-assets', true, 1048576,
  array['text/vcard', 'text/x-vcard']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No storage policies: world-readable via the public bucket, writes service-role only.
