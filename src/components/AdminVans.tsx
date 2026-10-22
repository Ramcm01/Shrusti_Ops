import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const inr = (n: number | null | undefined) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN')
const KINDS = ['printing', 'fabrication', 'other']

export default function AdminVans() {
  const [vehicles, setVehicles] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [econ, setEcon] = useState<any[]>([])
  const [assign, setAssign] = useState<any[]>([])
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')

  const [vLabel, setVLabel] = useState('')
  const [vNumber, setVNumber] = useState('')
  const [a, setA] = useState({ event_id: '', vehicle_id: '', start_date: '', end_date: '', daily_rate: '' })
  const [c, setC] = useState({ event_id: '', vehicle_id: '', kind: 'printing', description: '', amount: '' })

  const load = useCallback(async () => {
    const v = await supabase.from('vehicles').select('*').order('label')
    const e = await supabase.from('events').select('id,name,status').in('status', ['planned', 'running']).order('name')
    const m = await supabase.from('van_economics').select('*').order('event_name').order('van')
    const s = await supabase.from('event_vehicles').select('id,start_date,end_date,daily_rate,event:events(name),vehicle:vehicles(label,number)')
      .order('start_date', { ascending: false })
    const firstErr = v.error || e.error || m.error || s.error
    if (firstErr) setErr(firstErr.message)
    setVehicles((v.data as any[]) || [])
    setEvents((e.data as any[]) || [])
    setEcon((m.data as any[]) || [])
    setAssign((s.data as any[]) || [])
  }, [])

  useEffect(() => { load() }, [load])

  const done = (msg: string) => { setErr(''); setNotice(msg); load() }

  async function addVan(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('vehicles').insert({ label: vLabel.trim(), number: vNumber.trim().toUpperCase() })
    if (error) return setErr(error.message.includes('duplicate') ? 'This vehicle number already exists' : error.message)
    setVLabel(''); setVNumber(''); done('Van added.')
  }

  async function addAssign(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('event_vehicles').insert({
      event_id: a.event_id, vehicle_id: a.vehicle_id, start_date: a.start_date,
      end_date: a.end_date || null, daily_rate: Number(a.daily_rate || 0),
    })
    if (error) return setErr(error.message.includes('duplicate') ? 'This van already has that start date on this event' : error.message)
    setA({ ...a, vehicle_id: '', start_date: '', end_date: '', daily_rate: '' }); done('Van linked to the event.')
  }

  async function updateAssign(id: string, patch: Record<string, unknown>) {
    const { error } = await supabase.from('event_vehicles').update(patch).eq('id', id)
    if (error) setErr(error.message); else done('Saved.')
  }

  async function removeAssign(id: string) {
    if (!confirm('Remove this van from the event? Its logs and photos stay.')) return
    const { error } = await supabase.from('event_vehicles').delete().eq('id', id)
    if (error) setErr(error.message); else done('Removed.')
  }

  async function addCharge(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('event_charges').insert({
      event_id: c.event_id, vehicle_id: c.vehicle_id || null, kind: c.kind,
      description: c.description || null, amount: Number(c.amount),
    })
    if (error) return setErr(error.message)
    setC({ ...c, description: '', amount: '' }); done('Charge added.')
  }

  const seta = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setA({ ...a, [k]: e.target.value })
  const setc = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setC({ ...c, [k]: e.target.value })

  // group economics by event
  const byEvent: Record<string, any[]> = {}
  econ.forEach((r) => (byEvent[r.event_name] ||= []).push(r))

  return (
    <div className="stack">
      {err && <p className="error">{err}</p>}
      {notice && !err && <p className="ok">{notice}</p>}

      <h2>Per-van summary</h2>
      {econ.length === 0 && <div className="card muted">Link a van to an event below to see its numbers.</div>}
      {Object.entries(byEvent).map(([name, rows]) => (
        <div className="card" key={name}>
          <div className="row between">
            <strong>{name}</strong>
            <span className="chip">{rows[0].branch_name || rows[0].client_name}</span>
          </div>
          {rows.map((r) => (
            <div className="line" key={r.assignment_id}>
              <div className="row between">
                <strong>{r.van}</strong>
                <span className={Number(r.margin) >= 0 ? 'ok' : 'error'}>Margin {inr(r.margin)}</span>
              </div>
              <div className="muted">
                {r.start_date} → {r.end_date ?? 'ongoing'} · {r.days_to_date} days × {inr(r.daily_rate)} = {inr(r.rental_to_date)}
                {Number(r.charges_billed) > 0 && <> · printing/fabrication {inr(r.charges_billed)}</>}
              </div>
              <div className="muted">
                Costs: fuel {inr(r.fuel)} · fines {inr(r.fines)} · driver {inr(r.driver_pay)} · other {inr(r.other_costs)} · {r.total_km} km ({r.extra_km} extra)
              </div>
            </div>
          ))}
          <div className="row between" style={{ fontWeight: 800 }}>
            <span>Event rental to date</span>
            <span>{inr(rows.reduce((s, r) => s + Number(r.rental_to_date), 0))}</span>
          </div>
        </div>
      ))}

      <h2>Add a van</h2>
      <form className="card stack" onSubmit={addVan}>
        <label>Name<input value={vLabel} onChange={(e) => setVLabel(e.target.value)} placeholder="Chromepet Van 1" required /></label>
        <label>Registration number<input value={vNumber} onChange={(e) => setVNumber(e.target.value)} placeholder="TN 11 BD 7099" required /></label>
        <button className="btn primary">Add van</button>
      </form>

      <h2>Link a van to an event</h2>
      <form className="card stack" onSubmit={addAssign}>
        <label>Event
          <select value={a.event_id} onChange={seta('event_id')} required>
            <option value="">Select…</option>
            {events.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label>Van
          <select value={a.vehicle_id} onChange={seta('vehicle_id')} required>
            <option value="">Select…</option>
            {vehicles.map((x) => <option key={x.id} value={x.id}>{x.label || x.number} ({x.number})</option>)}
          </select>
        </label>
        <div className="row gap">
          <label className="grow">Start date<input type="date" value={a.start_date} onChange={seta('start_date')} required /></label>
          <label className="grow">End date (optional)<input type="date" value={a.end_date} onChange={seta('end_date')} /></label>
        </div>
        <label>Amount per day billed to client (₹)
          <input inputMode="decimal" value={a.daily_rate} onChange={seta('daily_rate')} required />
        </label>
        <button className="btn primary">Link van</button>
      </form>

      <h2>Van schedules ({assign.length})</h2>
      {assign.map((x) => (
        <div className="card" key={x.id}>
          <div className="row between">
            <strong>{x.vehicle?.label || x.vehicle?.number}</strong>
            <button className="link" onClick={() => removeAssign(x.id)}>Remove</button>
          </div>
          <div className="muted">{x.event?.name}</div>
          <div className="row gap">
            <label className="grow">Start<input type="date" defaultValue={x.start_date} onBlur={(e) => e.target.value && e.target.value !== x.start_date && updateAssign(x.id, { start_date: e.target.value })} /></label>
            <label className="grow">End<input type="date" defaultValue={x.end_date ?? ''} onBlur={(e) => e.target.value !== (x.end_date ?? '') && updateAssign(x.id, { end_date: e.target.value || null })} /></label>
            <label className="grow">₹ / day<input inputMode="decimal" defaultValue={x.daily_rate} onBlur={(e) => Number(e.target.value) !== Number(x.daily_rate) && updateAssign(x.id, { daily_rate: Number(e.target.value) || 0 })} /></label>
          </div>
        </div>
      ))}

      <h2>Printing and fabrication charges</h2>
      <form className="card stack" onSubmit={addCharge}>
        <label>Event
          <select value={c.event_id} onChange={setc('event_id')} required>
            <option value="">Select…</option>
            {events.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label>Van (optional)
          <select value={c.vehicle_id} onChange={setc('vehicle_id')}>
            <option value="">Whole event</option>
            {vehicles.map((x) => <option key={x.id} value={x.id}>{x.label || x.number}</option>)}
          </select>
        </label>
        <div className="row gap">
          <label className="grow">Type
            <select value={c.kind} onChange={setc('kind')}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
          </label>
          <label className="grow">Amount (₹)<input inputMode="decimal" value={c.amount} onChange={setc('amount')} required /></label>
        </div>
        <label>Description<input value={c.description} onChange={setc('description')} placeholder="Vinyl wrap, 280 sq.ft" /></label>
        <button className="btn primary">Add charge</button>
      </form>
    </div>
  )
}
