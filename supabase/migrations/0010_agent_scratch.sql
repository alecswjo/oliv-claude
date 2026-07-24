-- Private scratch bucket for the texting agent's HEIC conversion: iPhone
-- photos arrive as HEIC, which the analyzer/storage don't accept and which is
-- too CPU-heavy to convert in-function (wasm decode of a 12MP photo blows the
-- edge CPU budget). Instead the gateway uploads the raw HEIC here and reads it
-- back through Storage's image transformation (imgproxy handles HEIC → JPEG).
-- Objects are transient: written, converted, deleted within one request.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'agent-scratch', 'agent-scratch', false, 15728640,
  array['image/heic', 'image/heif', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No storage policies: service-role only.
