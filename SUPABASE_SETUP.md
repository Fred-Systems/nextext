# Supabase Setup — Public Anon Storage + RLS Policies

Supabase is used for chat media storage (images, videos, voice notes, files).
The app uses a **public anon client** — no Firebase auth bridging required.
Row Level Security policies control who can upload, read, and delete.

## Bucket setup

Supabase Dashboard → **Storage** → confirm a bucket named exactly `chat-media`
exists. If not, create it:
- **New bucket** → name: `chat-media`
- Toggle **Public** ON (needed for anon reads)

## RLS policies

Go to the `chat-media` bucket → **Policies** tab. The following three policies
are already in place (created manually):

**INSERT — anyone can upload:**
```sql
CREATE POLICY "Anyone can upload"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'chat-media');
```

**SELECT — anyone can read:**
```sql
CREATE POLICY "Anyone can read"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'chat-media');
```

**DELETE — only the uploader can delete their own file:**
```sql
CREATE POLICY "Users can delete their own uploads"
ON storage.objects FOR DELETE
TO anon
USING (
  bucket_id = 'chat-media'
  AND (storage.foldername(name))[2] = (current_setting('request.jwt.claims', true)::json->>'sub')
);
```

The delete policy checks that the path's embedded UID matches the current
user. File paths are structured as `{chatId}/{uploaderUid}/{timestamp}-{filename}`.

## What changed in the app code

- `src/supabase/config.js` uses a plain `createClient(url, anonKey)` — no
  Firebase JWT bridging. The anon key is safe to expose publicly.
- `src/supabase/media.js` uploads to
  `{chatId}/{uploaderUid}/{timestamp}-{filename}` so the delete policy can
  verify ownership.

## Known scope limitation

The SELECT policy allows any anon user to **read** any file in the bucket (not
scoped to "only actual participants of that specific chat"). For a trusted
friends-and-family app this is a reasonable tradeoff — files aren't publicly
listed or guessable, and the delete-ownership fix closes the actually dangerous
gap (anyone deleting anyone's files). Tightening read access further is
possible later if ever needed (would require a Postgres function that calls
out to Firestore, adding latency and complexity).
