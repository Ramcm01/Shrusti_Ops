// Supabase Edge Function: staff-admin
// Actions: login (phone + PIN, with lockout), create_staff, reset_pin, create_customer.
// Deploy with "Verify JWT" switched OFF (the function checks the caller itself).
// Required secret: PIN_PEPPER (a long random string, set once and never changed).
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PEPPER = Deno.env.get("PIN_PEPPER") ?? "";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function normPhone(p: string): string {
  const d = String(p ?? "").replace(/\D/g, "");
  return d.length === 10 ? "91" + d : d;
}

const emailFor = (phone: string) => `${phone}@staff.example.com`;

// The real auth password is derived from the PIN with a server-side secret,
// so the 4-digit PIN can never be tried directly against the public auth API.
async function derive(phone: string, pin: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(PEPPER), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${phone}:${pin}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomPin(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 9000;
  return String(1000 + n);
}

async function caller(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  if (!data.user) return null;
  const { data: p } = await admin.from("profiles").select("id, role, active").eq("id", data.user.id).maybeSingle();
  return p && p.active ? p : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!PEPPER) return json({ error: "Server is not configured (PIN_PEPPER missing)" }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const action = body.action;

  // ---------- login ----------
  if (action === "login") {
    const phone = normPhone(body.phone);
    const pin = String(body.pin ?? "");
    const generic = () => json({ error: "Wrong mobile number or PIN" }, 401);
    if (!/^\d{4}$/.test(pin) || phone.length < 10) return generic();

    const { data: prof } = await admin.from("profiles")
      .select("id, active, failed_pin_attempts, locked_until").eq("phone", phone).maybeSingle();
    if (!prof) return generic();
    if (!prof.active) return json({ error: "Your account is switched off. Contact admin." }, 403);
    if (prof.locked_until && new Date(prof.locked_until) > new Date()) {
      const mins = Math.ceil((new Date(prof.locked_until).getTime() - Date.now()) / 60000);
      return json({ error: `Too many wrong attempts. Try again in ${mins} min or ask admin to reset your PIN.` }, 423);
    }

    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signInWithPassword({
      email: emailFor(phone), password: await derive(phone, pin),
    });
    if (error || !data.session) {
      const attempts = (prof.failed_pin_attempts ?? 0) + 1;
      const patch: Record<string, unknown> = { failed_pin_attempts: attempts };
      if (attempts >= MAX_ATTEMPTS) {
        patch.locked_until = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
        patch.failed_pin_attempts = 0;
      }
      await admin.from("profiles").update(patch).eq("id", prof.id);
      return generic();
    }
    await admin.from("profiles").update({ failed_pin_attempts: 0, locked_until: null }).eq("id", prof.id);
    return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  }

  // ---------- everything below needs a signed-in owner / admin ----------
  const me = await caller(req);
  if (!me || !["owner", "admin"].includes(me.role)) return json({ error: "Not allowed" }, 403);

  if (action === "create_staff") {
    const phone = normPhone(body.phone);
    const role = String(body.role);
    const allowed = ["promoter", "driver", "supervisor", "accounts", "admin"];
    if (!allowed.includes(role)) return json({ error: "Invalid role" }, 400);
    if (role === "admin" && me.role !== "owner") return json({ error: "Only the owner can create admins" }, 403);
    if (phone.length !== 12) return json({ error: "Enter a 10-digit mobile number" }, 400);
    const name = String(body.full_name ?? "").trim();
    if (!name) return json({ error: "Name is required" }, 400);
    const pin = body.pin ? String(body.pin) : randomPin();
    if (!/^\d{4}$/.test(pin)) return json({ error: "PIN must be 4 digits" }, 400);

    const payType = body.pay_type === "monthly" ? "monthly" : "daily";
    const rate = Number(body.rate ?? 0) || 0;

    const { data: created, error } = await admin.auth.admin.createUser({
      email: emailFor(phone), password: await derive(phone, pin), email_confirm: true,
    });
    if (error || !created.user) return json({ error: error?.message ?? "Could not create user" }, 400);

    const { error: pErr } = await admin.from("profiles").insert({
      id: created.user.id, full_name: name, phone, role, pay_type: payType,
      day_rate: payType === "daily" ? rate : 0,
      monthly_salary: payType === "monthly" ? rate : 0,
    });
    if (pErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: pErr.message.includes("duplicate") ? "This mobile number already exists" : pErr.message }, 400);
    }
    return json({ ok: true, pin });
  }

  if (action === "reset_pin") {
    const { data: target } = await admin.from("profiles").select("id, phone, role").eq("id", body.user_id).maybeSingle();
    if (!target || !target.phone) return json({ error: "Person not found" }, 404);
    if (target.role === "owner" || (target.role === "admin" && me.role !== "owner")) {
      return json({ error: "Not allowed" }, 403);
    }
    const pin = randomPin();
    const { error } = await admin.auth.admin.updateUserById(target.id, { password: await derive(target.phone, pin) });
    if (error) return json({ error: error.message }, 400);
    await admin.from("profiles").update({ failed_pin_attempts: 0, locked_until: null }).eq("id", target.id);
    return json({ ok: true, pin });
  }

  if (action === "create_customer") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const title = String(body.title);
    if (!email || password.length < 8) return json({ error: "Email and a password of 8+ characters are required" }, 400);
    if (!["marketing_manager", "branch_head", "brand_head", "agency_admin"].includes(title)) return json({ error: "Invalid title" }, 400);
    if (title === "branch_head" && !body.branch_name) return json({ error: "Branch name is required for branch heads" }, 400);

    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !created.user) return json({ error: error?.message ?? "Could not create user" }, 400);

    const { error: pErr } = await admin.from("profiles").insert({
      id: created.user.id, full_name: String(body.full_name ?? "").trim(), role: "customer",
    });
    if (pErr) { await admin.auth.admin.deleteUser(created.user.id); return json({ error: pErr.message }, 400); }

    const { error: mErr } = await admin.from("client_members").insert({
      user_id: created.user.id, client_id: body.client_id, title, branch_name: body.branch_name || null,
    });
    if (mErr) { await admin.auth.admin.deleteUser(created.user.id); return json({ error: mErr.message }, 400); }
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});
