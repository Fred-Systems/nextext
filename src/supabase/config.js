import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://hkpfojusvnnifvwkjbol.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_xWb4cwhKwWkV2fdBnpMfvQ_bacRB1Cy";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

export const MEDIA_BUCKET = "chat-media";
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB -- Supabase free-tier per-file cap
