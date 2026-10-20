import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { callFn } from '../lib/fn'
import type { Profile } from '../types'
import { displayPhone } from '../lib/util'

const ROLES = ['promoter', 'driver', 'supervisor', 'accounts', 'admin']

export default function AdminStaff({ me }: { me: Profile }) {
  const [staff, setStaff] = useState<Profile[]>([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('promoter')
  const [payType, setPayType] = useState('daily')
  const [rate, setRate] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('role', 'customer')
      .order('role')
      .order('full_name')
    if (error) setErr(error.message)
    else setStaff((data as Profile[]) || [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    setNotice('')
    try {
      const res = await callFn<{ pin: string }>('create_staff', {
        full_name: name,
        phone,
        role,
        pay_type: payType,
        rate: Number(rate || 0),
        pin: pin || undefined,
      })
      setNotice(`Created ${name}. Login: ${phone} · PIN ${res.pin}. Share this PIN now, it will not be shown again.`)
      setName(''); setPhone(''); setRate(''); setPin('')
      load()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function resetPin(p: Profile) {
    if (!confirm(`Set a new PIN for ${p.full_name}?`)) return
    setErr(''); setNotice('')
    try {
      const res = await callFn<{ pin: string }>('reset_pin', { user_id: p.id })
      setNotice(`New PIN for ${p.full_name}: ${res.pin}. Share it now, it will not be shown again.`)
    } catch (e: any) {
      setErr(e.message)
    }
  }

  async function setActive(p: Profile, active: boolean) {
    const { error } = await supabase.from('profiles').update({ active }).eq('id', p.id)
    if (error) setErr(error.message)
    else load()
  }

  async function saveRate(p: Profile, value: string) {
    const n = Number(value)
    if (Number.isNaN(n)) return
    const patch = p.pay_type === 'monthly' ? { monthly_salary: n } : { day_rate: n }
    const { error } = await supabase.from('profiles').update(patch).eq('id', p.id)
    if (error) setErr(error.message)
  }

  return (
    <div className="stack">
      <h2>Add staff</h2>
      <form className="card stack" onSubmit={add}>
        <label>Full name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Mobile number (10 digits)
          <input inputMode="numeric" maxLength={10} value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} required />
        </label>
        <div className="row gap">
          <label className="grow">Role
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.filter((r) => r !== 'admin' || me.role === 'owner').map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <label className="grow">Pay type
            <select value={payType} onChange={(e) => setPayType(e.target.value)}>
              <option value="daily">Daily</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
        </div>
        <div className="row gap">
          <label className="grow">{payType === 'daily' ? 'Day rate (₹)' : 'Monthly salary (₹)'}
            <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
          </label>
          <label className="grow">PIN (blank = auto)
            <input inputMode="numeric" maxLength={4} value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          </label>
        </div>
        {err && <p className="error">{err}</p>}
        {notice && <p className="ok">{notice}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>

      <h2>Team ({staff.length})</h2>
      {staff.map((p) => (
        <div className="card" key={p.id}>
          <div className="row between">
            <strong>{p.full_name}</strong>
            <span className="chip">{p.role}</span>
          </div>
          <div className="muted">{displayPhone(p.phone)}</div>
          <div className="row gap">
            <label className="grow">{p.pay_type === 'monthly' ? 'Monthly ₹' : 'Day rate ₹'}
              <input inputMode="decimal"
                defaultValue={p.pay_type === 'monthly' ? p.monthly_salary : p.day_rate}
                onBlur={(e) => saveRate(p, e.target.value)} />
            </label>
          </div>
          <div className="row between">
            <label className="check">
              <input type="checkbox" checked={p.active} onChange={(e) => setActive(p, e.target.checked)} /> Active
            </label>
            {p.id !== me.id && p.phone && <button className="btn" onClick={() => resetPin(p)}>Reset PIN</button>}
          </div>
        </div>
      ))}
    </div>
  )
}
