import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const SERVICES = ['adbike', 'lookwalker', 'pamphlet', 'mobile_van', 'fabrication', 'print', 'other']
const STATUSES = ['planned', 'running', 'completed', 'cancelled']

export default function AdminEvents() {
  const [clients, setClients] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [assigned, setAssigned] = useState<Record<string, boolean>>({})
  const [rates, setRates] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')

  // forms
  const [clientName, setClientName] = useState('')
  const [f, setF] = useState({
    client_id: '', name: '', service: 'other', location: '', branch_name: '',
    start_date: '', end_date: '', daily_start: '09:00', daily_end: '18:00', status: 'running',
  })

  const load = useCallback(async () => {
    const c = await supabase.from('clients').select('id,name').order('name')
    const e = await supabase.from('events').select('*, client:clients(name)').order('created_at', { ascending: false })
    const s = await supabase.from('profiles').select('id,full_name,role').eq('active', true)
      .in('role', ['promoter', 'driver', 'supervisor']).order('full_name')
    if (c.error || e.error || s.error) setErr((c.error || e.error || s.error)!.message)
    setClients((c.data as any[]) || [])
    setEvents((e.data as any[]) || [])
    setStaff((s.data as any[]) || [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function addClient(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('clients').insert({ name: clientName.trim() })
    if (error) setErr(error.message)
    else { setClientName(''); setErr(''); load() }
  }

  async function addEvent(e: React.FormEvent) {
    e.preventDefault()
    const row: any = { ...f }
    Object.keys(row).forEach((k) => { if (row[k] === '') row[k] = null })
    const { error } = await supabase.from('events').insert(row)
    if (error) setErr(error.message)
    else {
      setErr('')
      setF({ ...f, name: '', location: '', branch_name: '', start_date: '', end_date: '' })
      load()
    }
  }

  async function openEvent(id: string) {
    if (open === id) return setOpen(null)
    setOpen(id)
    const a = await supabase.from('event_assignments').select('person_id').eq('event_id', id)
    const m: Record<string, boolean> = {}
    ;((a.data as any[]) || []).forEach((x) => (m[x.person_id] = true))
    setAssigned(m)
    const r = await supabase.from('event_rates').select('role,rate').eq('event_id', id)
    const rm: Record<string, string> = {}
    ;((r.data as any[]) || []).forEach((x) => (rm[x.role] = String(x.rate)))
    setRates(rm)
  }

  async function toggle(eventId: string, personId: string, on: boolean) {
    const q = on
      ? supabase.from('event_assignments').insert({ event_id: eventId, person_id: personId })
      : supabase.from('event_assignments').delete().eq('event_id', eventId).eq('person_id', personId)
    const { error } = await q
    if (error) setErr(error.message)
    else setAssigned({ ...assigned, [personId]: on })
  }

  async function saveRate(eventId: string, role: string, value: string) {
    if (value === '') {
      await supabase.from('event_rates').delete().eq('event_id', eventId).eq('role', role)
      return
    }
    const { error } = await supabase
      .from('event_rates')
      .upsert({ event_id: eventId, role, rate: Number(value) }, { onConflict: 'event_id,role' })
    if (error) setErr(error.message)
  }

  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from('events').update({ status }).eq('id', id)
    if (error) setErr(error.message)
    else load()
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value })

  return (
    <div className="stack">
      {err && <p className="error">{err}</p>}

      <h2>Clients</h2>
      <form className="card row gap" onSubmit={addClient}>
        <input className="grow" placeholder="New client name (e.g. Appa Textiles)" value={clientName}
          onChange={(e) => setClientName(e.target.value)} required />
        <button className="btn primary">Add</button>
      </form>

      <h2>New event</h2>
      <form className="card stack" onSubmit={addEvent}>
        <label>Client
          <select value={f.client_id} onChange={set('client_id')} required>
            <option value="">Select…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Event name<input value={f.name} onChange={set('name')} placeholder="Appa Textiles - Cycle Branding" required /></label>
        <div className="row gap">
          <label className="grow">Service
            <select value={f.service} onChange={set('service')}>{SERVICES.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
          <label className="grow">Status
            <select value={f.status} onChange={set('status')}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
        </div>
        <label>Location<input value={f.location} onChange={set('location')} /></label>
        <label>Client branch (for branch heads)<input value={f.branch_name} onChange={set('branch_name')} /></label>
        <div className="row gap">
          <label className="grow">Start date<input type="date" value={f.start_date} onChange={set('start_date')} /></label>
          <label className="grow">End date<input type="date" value={f.end_date} onChange={set('end_date')} /></label>
        </div>
        <div className="row gap">
          <label className="grow">Daily start<input type="time" value={f.daily_start} onChange={set('daily_start')} /></label>
          <label className="grow">Daily end<input type="time" value={f.daily_end} onChange={set('daily_end')} /></label>
        </div>
        <button className="btn primary">Create event</button>
      </form>

      <h2>Events ({events.length})</h2>
      {events.map((ev) => (
        <div className="card" key={ev.id}>
          <div className="row between" onClick={() => openEvent(ev.id)} style={{ cursor: 'pointer' }}>
            <div>
              <strong>{ev.name}</strong>
              <div className="muted">{ev.client?.name}{ev.location ? ` · ${ev.location}` : ''}</div>
            </div>
            <span className="chip">{ev.status}</span>
          </div>
          {open === ev.id && (
            <div className="stack">
              <label>Status
                <select value={ev.status} onChange={(e) => setStatus(ev.id, e.target.value)}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <div className="row gap">
                {['promoter', 'driver'].map((r) => (
                  <label className="grow" key={r}>{r} day rate ₹ (optional)
                    <input inputMode="decimal" defaultValue={rates[r] ?? ''} key={ev.id + r + (rates[r] ?? '')}
                      onBlur={(e) => saveRate(ev.id, r, e.target.value)} />
                  </label>
                ))}
              </div>
              <strong>Assign team</strong>
              {staff.length === 0 && <span className="muted">Add staff first.</span>}
              {staff.map((p) => (
                <label className="check" key={p.id}>
                  <input type="checkbox" checked={!!assigned[p.id]} onChange={(e) => toggle(ev.id, p.id, e.target.checked)} />
                  {p.full_name} <span className="muted">({p.role})</span>
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
