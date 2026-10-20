import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { callFn } from '../lib/fn'

export default function Login() {
  const [mode, setMode] = useState<'staff' | 'office'>('staff')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      if (mode === 'staff') {
        const res = await callFn<{ access_token: string; refresh_token: string }>('login', { phone, pin })
        const { error } = await supabase.auth.setSession({
          access_token: res.access_token,
          refresh_token: res.refresh_token,
        })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (e: any) {
      setErr(e.message || 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <h1>Shrusti Ops</h1>
      <p className="muted">Sign in to start your day</p>
      <div className="seg">
        <button className={mode === 'staff' ? 'on' : ''} onClick={() => setMode('staff')} type="button">Staff</button>
        <button className={mode === 'office' ? 'on' : ''} onClick={() => setMode('office')} type="button">Office / Customer</button>
      </div>
      <form onSubmit={submit} className="stack">
        {mode === 'staff' ? (
          <>
            <label>Mobile number
              <input inputMode="numeric" autoComplete="tel" maxLength={10} placeholder="10-digit number"
                value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} required />
            </label>
            <label>4-digit PIN
              <input type="password" inputMode="numeric" maxLength={4} placeholder="••••"
                value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} required />
            </label>
          </>
        ) : (
          <>
            <label>Email
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>Password
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
          </>
        )}
        {err && <p className="error">{err}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
}
