import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase'

// Calls the staff-admin Edge Function (PIN login, create staff, reset PIN, create customer)
export async function callFn<T = any>(
  action: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
  }
  const { data } = await supabase.auth.getSession()
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`
  const res = await fetch(`${SUPABASE_URL}/functions/v1/staff-admin`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...body }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as any).error || `Request failed (${res.status})`)
  return json as T
}
