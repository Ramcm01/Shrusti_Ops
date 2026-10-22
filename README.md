# Shrusti Ops

Staff sign-in with camera and GPS, supervisor approvals, and admin screens for staff, clients, events and customer logins.
Built with React + Vite, backed by Supabase.

## One-time setup

1. **Database patches.** In Supabase SQL Editor, run `supabase/patch2.sql`, then `supabase/patch3.sql` (vans module), after `ops_schema.sql`.
2. **Edge Function.** Supabase dashboard -> Edge Functions -> Deploy a new function named `staff-admin`.
   Paste the code from `supabase/functions/staff-admin/index.ts`.
   In the function settings, switch **Verify JWT OFF**.
3. **Secret.** Edge Functions -> Secrets -> add `PIN_PEPPER` = a long random string (40+ characters).
   Set it once and never change it, or every PIN stops working.
4. **Deploy the app.** Push this folder to GitHub, import it in Vercel (framework: Vite). No environment variables are needed;
   the Supabase URL and public anon key are already set in `src/lib/supabase.ts`.
5. In Supabase -> Authentication -> URL Configuration, set **Site URL** to your Vercel address.

## Run locally

    npm install
    npm run dev

Camera and GPS need HTTPS, which Vercel provides. On localhost they work in the browser too.
