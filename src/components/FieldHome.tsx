import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'
import Camera, { Shot } from './Camera'
import { istDate, daysAgoIST, fmtTime, fmtDate } from '../lib/util'

interface EventRow {
  id: string
  name: string
  location: string | null
  status: string
  daily_start: string
  daily_end: string
}

type Mode = { kind: 'in' | 'out' | 'proof'; event: EventRow; att?: any } | null

export default function FieldHome({ profile }: { profile: Profile }) {
  const [events, setEvents] = useState<EventRow[]>([])
  const [records, setRecords] = useState<any[]>([])
  const [mode, setMode] = useState<Mode>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const a = await supabase
      .from('event_assignments')
      .select('event:events(id,name,location,status,daily_start,daily_end)')
      .eq('person_id', profile.id)
    if (a.error) setErr(a.error.message)
    const list = ((a.data as any[]) || [])
      .map((r) => r.event as EventRow)
      .filter((e) => e && (e.status === 'planned' || e.status === 'running'))
    setEvents(list)

    const t = await supabase
      .from('attendance')
      .select('*, event:events(name)')
      .eq('person_id', profile.id)
      .gte('work_date', daysAgoIST(7))
      .order('work_date', { ascending: false })
    if (t.error) setErr(t.error.message)
    setRecords((t.data as any[]) || [])
  }, [profile.id])

  useEffect(() => {
    load()
  }, [load])

  const today = istDate()
  const todayRec = (eventId: string) =>
    records.find((r) => r.event_id === eventId && r.work_date === today)

  async function uploadPhoto(blob: Blob, eventId: string) {
    const path = `${profile.id}/${eventId}/${Date.now()}.jpg`
    const { error } = await supabase.storage.from('event-photos').upload(path, blob, { contentType: 'image/jpeg' })
    if (error) throw error
    return path
  }

  async function savePhoto(eventId: string, attId: string | null, kind: string, path: string, shot: Shot) {
    const { error } = await supabase.from('event_photos').insert({
      event_id: eventId,
      attendance_id: attId,
      uploaded_by: profile.id,
      kind,
      storage_path: path,
      captured_at: shot.capturedAt.toISOString(),
      lat: shot.lat,
      lng: shot.lng,
      accuracy_m: Math.round(shot.accuracy * 10) / 10,
    })
    if (error) throw error
  }

  async function onShot(shot: Shot) {
    if (!mode) return
    const { kind, event, att } = mode
    setMode(null)
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      const path = await uploadPhoto(shot.blob, event.id)
      if (kind === 'in') {
        const { data, error } = await supabase
          .from('attendance')
          .insert({
            person_id: profile.id,
            event_id: event.id,
            work_date: istDate(),
            status: 'present',
            check_in_at: new Date().toISOString(),
            check_in_lat: shot.lat,
            check_in_lng: shot.lng,
          })
          .select()
          .single()
        if (error) throw error
        await savePhoto(event.id, data.id, 'check_in', path, shot)
        setMsg('Signed in. Have a good day!')
      } else if (kind === 'out') {
        const { error } = await supabase
          .from('attendance')
          .update({
            check_out_at: new Date().toISOString(),
            check_out_lat: shot.lat,
            check_out_lng: shot.lng,
          })
          .eq('id', att.id)
        if (error) throw error
        await savePhoto(event.id, att.id, 'check_out', path, shot)
        setMsg('Signed out. Thank you!')
      } else {
        await savePhoto(event.id, att?.id ?? null, 'proof', path, shot)
        setMsg('Proof photo saved.')
      }
    } catch (e: any) {
      const m: string = e.message || 'Something went wrong'
      setErr(m.includes('duplicate') ? 'You have already signed in for this event today.' : m)
    } finally {
      setBusy(false)
      load()
    }
  }

  if (mode)
    return (
      <Camera
        title={mode.kind === 'in' ? 'Sign in' : mode.kind === 'out' ? 'Sign out' : 'Proof photo'}
        personName={profile.full_name}
        eventName={mode.event.name}
        defaultFacing={mode.kind === 'proof' ? 'environment' : 'user'}
        onDone={onShot}
        onCancel={() => setMode(null)}
      />
    )

  return (
    <div className="stack">
      <h2>Today</h2>
      {busy && <p className="muted">Saving…</p>}
      {msg && <p className="ok">{msg}</p>}
      {err && <p className="error">{err}</p>}

      {events.length === 0 && (
        <div className="card muted">No events assigned to you yet. Please check with your supervisor.</div>
      )}

      {events.map((ev) => {
        const rec = todayRec(ev.id)
        return (
          <div className="card" key={ev.id}>
            <div className="row between">
              <strong>{ev.name}</strong>
              <span className="chip">{ev.daily_start.slice(0, 5)}–{ev.daily_end.slice(0, 5)}</span>
            </div>
            {ev.location && <div className="muted">{ev.location}</div>}

            {!rec && (
              <button className="btn primary big" disabled={busy} onClick={() => setMode({ kind: 'in', event: ev })}>
                Sign in
              </button>
            )}
            {rec && !rec.check_out_at && (
              <>
                <div className="ok">Signed in at {fmtTime(rec.check_in_at)}</div>
                <div className="row gap">
                  <button className="btn" disabled={busy} onClick={() => setMode({ kind: 'proof', event: ev, att: rec })}>
                    Proof photo
                  </button>
                  <button className="btn primary" disabled={busy} onClick={() => setMode({ kind: 'out', event: ev, att: rec })}>
                    Sign out
                  </button>
                </div>
              </>
            )}
            {rec && rec.check_out_at && (
              <div className="muted">
                {fmtTime(rec.check_in_at)} → {fmtTime(rec.check_out_at)} ·{' '}
                {rec.approved_at ? (rec.status === 'absent' ? 'Rejected' : 'Approved') : 'Waiting for approval'}
              </div>
            )}
          </div>
        )
      })}

      <h2>Last 7 days</h2>
      <div className="card">
        {records.length === 0 && <span className="muted">Nothing yet.</span>}
        {records.map((r) => (
          <div className="row between line" key={r.id}>
            <span>{fmtDate(r.work_date)} · {r.event?.name}</span>
            <span className="muted">
              {fmtTime(r.check_in_at)}–{fmtTime(r.check_out_at)}{' '}
              {r.approved_at ? (r.status === 'absent' ? '✗' : '✓') : '…'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
