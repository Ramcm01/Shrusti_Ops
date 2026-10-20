import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import type { Profile } from './types'
import Login from './components/Login'
import FieldHome from './components/FieldHome'
import Approvals from './components/Approvals'
import AdminEvents from './components/AdminEvents'
import AdminStaff from './components/AdminStaff'
import Customers from './components/Customers'

type Tab = 'approvals' | 'events' | 'staff' | 'customers'

export default function App() {
  const [ready, setReady] = useState(false)
  const [uid, setUid] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [tab, setTab] = useState<Tab>('approvals')
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUid(data.session?.user.id ?? null)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUid(session?.user.id ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!uid) {
      setProfile(null)
      return
    }
    supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setErr(error.message)
        else if (!data) setErr('This account has no profile yet. Please ask your admin.')
        else {
          setProfile(data as Profile)
          setErr('')
        }
      })
  }, [uid])

  const signOut = () => supabase.auth.signOut()

  if (!ready) return <div className="center muted">Loading…</div>
  if (!uid) return <Login />
  if (err)
    return (
      <div className="center">
        <p className="error">{err}</p>
        <button className="btn" onClick={signOut}>Sign out</button>
      </div>
    )
  if (!profile) return <div className="center muted">Loading…</div>
  if (!profile.active)
    return (
      <div className="center">
        <p className="error">Your account is switched off. Please contact your admin.</p>
        <button className="btn" onClick={signOut}>Sign out</button>
      </div>
    )

  const role = profile.role
  const field = role === 'promoter' || role === 'driver'
  const office = role === 'owner' || role === 'admin' || role === 'accounts'

  let body: JSX.Element
  if (field) body = <FieldHome profile={profile} />
  else if (role === 'customer')
    body = (
      <div className="card">
        <h2>Welcome, {profile.full_name}</h2>
        <p className="muted">Your event reports, photos and chat will appear here soon.</p>
      </div>
    )
  else if (tab === 'events' && office) body = <AdminEvents />
  else if (tab === 'staff' && office) body = <AdminStaff me={profile} />
  else if (tab === 'customers' && office) body = <Customers />
  else body = <Approvals />

  return (
    <div className="app">
      <header className="top">
        <div>
          <div className="brand">Shrusti Ops</div>
          <div className="who">{profile.full_name} · {role}</div>
        </div>
        <button className="link" onClick={signOut}>Sign out</button>
      </header>
      <main>{body}</main>
      {(office || role === 'supervisor') && (
        <nav className="tabs">
          <button className={tab === 'approvals' ? 'on' : ''} onClick={() => setTab('approvals')}>Approvals</button>
          {office && <button className={tab === 'events' ? 'on' : ''} onClick={() => setTab('events')}>Events</button>}
          {office && <button className={tab === 'staff' ? 'on' : ''} onClick={() => setTab('staff')}>Staff</button>}
          {office && <button className={tab === 'customers' ? 'on' : ''} onClick={() => setTab('customers')}>Customers</button>}
        </nav>
      )}
    </div>
  )
}
