import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { callFn } from '../lib/fn'

const TITLES = [
  ['marketing_manager', 'Marketing manager'],
  ['branch_head', 'Branch head'],
  ['brand_head', 'Brand head'],
  ['agency_admin', 'Agency admin'],
]

export default function Customers() {
  const [clients, setClients] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [clientId, setClientId] = useState('')
  const [title, setTitle] = useState('marketing_manager')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [branch, setBranch] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    const c = await supabase.from('clients').select('id,name').order('name')
    setClients((c.data as any[]) || [])
    const m = await supabase
      .from('client_members')
      .select('title,branch_name,client:clients(name),profile:profiles(full_name)')
    if (m.error) setErr(m.error.message)
    setMembers((m.data as any[]) || [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(''); setNotice('')
    try {
      await callFn('create_customer', {
        full_name: name,
        email,
        password,
        client_id: clientId,
        title,
        branch_name: title === 'branch_head' ? branch : null,
      })
      setNotice(`Created ${name}. They sign in with ${email} and the password you set.`)
      setName(''); setEmail(''); setPassword(''); setBranch('')
      load()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <h2>Add customer user</h2>
      <form className="card stack" onSubmit={add}>
        <label>Client company
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            <option value="">Select…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Title
          <select value={title} onChange={(e) => setTitle(e.target.value)}>
            {TITLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        {title === 'branch_head' && (
          <label>Branch name (must match the event's branch)
            <input value={branch} onChange={(e) => setBranch(e.target.value)} required />
          </label>
        )}
        <label>Full name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password (min 8 characters)
          <input value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        </label>
        {err && <p className="error">{err}</p>}
        {notice && <p className="ok">{notice}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create customer login'}</button>
      </form>

      <h2>Customer users ({members.length})</h2>
      {members.map((m, i) => (
        <div className="card" key={i}>
          <div className="row between">
            <strong>{m.profile?.full_name}</strong>
            <span className="chip">{String(m.title).replace('_', ' ')}</span>
          </div>
          <div className="muted">{m.client?.name}{m.branch_name ? ` · ${m.branch_name}` : ''}</div>
        </div>
      ))}
    </div>
  )
}
