import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtDate, fmtTime, mapLink } from '../lib/util'

export default function Approvals() {
  const [rows, setRows] = useState<any[]>([])
  const [photos, setPhotos] = useState<Record<string, { url: string; kind: string; flag: string }[]>>({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const a = await supabase
      .from('attendance')
      .select('*, person:profiles!attendance_person_id_fkey(full_name,phone,role), event:events(name)')
      .is('approved_at', null)
      .not('check_in_at', 'is', null)
      .order('work_date', { ascending: false })
      .limit(100)
    if (a.error) {
      setErr(a.error.message)
      setLoading(false)
      return
    }
    const list = (a.data as any[]) || []
    setRows(list)

    const ids = list.map((r) => r.id)
    const map: Record<string, { url: string; kind: string; flag: string }[]> = {}
    if (ids.length) {
      const p = await supabase
        .from('event_photos')
        .select('attendance_id,kind,storage_path,time_mismatch,low_accuracy')
        .in('attendance_id', ids)
        .order('captured_at')
      const ph = (p.data as any[]) || []
      if (ph.length) {
        const signed = await supabase.storage
          .from('event-photos')
          .createSignedUrls(ph.map((x) => x.storage_path), 3600)
        ph.forEach((x, i) => {
          const url = signed.data?.[i]?.signedUrl
          if (!url) return
          const flag = [x.time_mismatch ? 'clock off' : '', x.low_accuracy ? 'weak GPS' : ''].filter(Boolean).join(', ')
          ;(map[x.attendance_id] ||= []).push({ url, kind: x.kind, flag })
        })
      }
    }
    setPhotos(map)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function decide(row: any, status: 'present' | 'half_day' | 'absent') {
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('attendance')
      .update({ status, approved_by: u.user?.id, approved_at: new Date().toISOString() })
      .eq('id', row.id)
    if (error) setErr(error.message)
    else setRows((r) => r.filter((x) => x.id !== row.id))
  }

  return (
    <div className="stack">
      <div className="row between">
        <h2>Pending approvals ({rows.length})</h2>
        <button className="link" onClick={load}>Refresh</button>
      </div>
      {err && <p className="error">{err}</p>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && rows.length === 0 && <div className="card muted">All caught up.</div>}

      {rows.map((r) => (
        <div className="card" key={r.id}>
          <div className="row between">
            <strong>{r.person?.full_name}</strong>
            <span className="chip">{r.person?.role}</span>
          </div>
          <div>{r.event?.name} · {fmtDate(r.work_date)}</div>
          <div className="muted">
            In {fmtTime(r.check_in_at)} · Out {r.check_out_at ? fmtTime(r.check_out_at) : 'still on duty'}
          </div>
          <div className="row gap">
            <a href={mapLink(r.check_in_lat, r.check_in_lng)} target="_blank" rel="noreferrer">Sign-in location</a>
            {r.check_out_lat && <a href={mapLink(r.check_out_lat, r.check_out_lng)} target="_blank" rel="noreferrer">Sign-out location</a>}
          </div>
          {(photos[r.id] || []).length > 0 && (
            <div className="thumbs">
              {photos[r.id].map((p, i) => (
                <a key={i} href={p.url} target="_blank" rel="noreferrer" className="thumb">
                  <img src={p.url} alt={p.kind} />
                  <span>{p.kind.replace('_', ' ')}{p.flag ? ` · ${p.flag}` : ''}</span>
                </a>
              ))}
            </div>
          )}
          <div className="row gap">
            <button className="btn primary" onClick={() => decide(r, 'present')}>Full day</button>
            <button className="btn" onClick={() => decide(r, 'half_day')}>Half day</button>
            <button className="btn danger" onClick={() => decide(r, 'absent')}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  )
}
