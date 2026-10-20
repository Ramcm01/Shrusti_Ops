import { createClient } from '@supabase/supabase-js'

// The anon key is designed to be public. Row-level security in the database protects the data.
export const SUPABASE_URL: string =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://nvedhjwprbrbcpeepcuc.supabase.co'
export const SUPABASE_ANON_KEY: string =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52ZWRoandwcmJyYmNwZWVwY3VjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MjgwMjksImV4cCI6MjEwODAwNDAyOX0.eee8k07a3EcBJeQqUzXQvVNcF3UTQV80EE_8OGWEfLA'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
})
