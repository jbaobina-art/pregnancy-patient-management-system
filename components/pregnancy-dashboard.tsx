'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Activity, AlertCircle, Baby, Bell, CalendarDays, Check, ChevronDown, Clock3, Droplets, HeartPulse, LogOut, Menu, Plus, Search, ShieldCheck, Stethoscope, UserRound, Users, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Patient = {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  due_date: string
  pregnancy_notes: string | null
  birth_plan: string | null
  water_break_reported: boolean
  water_break_time: string | null
  water_break_notes: string | null
  status: string
  created_at: string
}
type PatientEvent = { id: string; event_type: string; summary: string; details: string | null; occurred_at: string }
type PatientDraft = { full_name: string; phone: string; email: string; due_date: string; pregnancy_notes: string; birth_plan: string }

const supabase = createClient()
const blankPatient: PatientDraft = { full_name: '', phone: '', email: '', due_date: '', pregnancy_notes: '', birth_plan: '' }

function daysUntil(date: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${date}T00:00:00`)
  return Math.ceil((due.getTime() - today.getTime()) / 86400000)
}
function gestation(date: string) {
  const days = 280 - daysUntil(date)
  return `${Math.floor(days / 7)}w ${days % 7}d`
}
function prettyDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

export function PregnancyDashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [patients, setPatients] = useState<Patient[]>([])
  const [events, setEvents] = useState<PatientEvent[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [modal, setModal] = useState(false)
  const [draft, setDraft] = useState(blankPatient)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [eventDraft, setEventDraft] = useState('')
  const [mobileNav, setMobileNav] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setAuthReady(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => subscription.unsubscribe()
  }, [])

  const loadPatients = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('patients').select('id,full_name,phone,email,due_date,pregnancy_notes,birth_plan,water_break_reported,water_break_time,water_break_notes,status,created_at').order('due_date', { ascending: true })
    if (error) setNotice('Could not load patient records. Check the database connection and try again.')
    else {
      setPatients((data ?? []) as Patient[])
      setSelected((current) => current && data?.some((patient) => patient.id === current) ? current : data?.[0]?.id ?? null)
    }
    setLoading(false)
  }, [])

  const loadEvents = useCallback(async (patientId: string) => {
    const { data } = await supabase.from('patient_events').select('id,event_type,summary,details,occurred_at').eq('patient_id', patientId).order('occurred_at', { ascending: false }).limit(8)
    setEvents((data ?? []) as PatientEvent[])
  }, [])

  useEffect(() => { if (user) void loadPatients() }, [user, loadPatients])
  useEffect(() => { if (selected && user) void loadEvents(selected); else setEvents([]) }, [selected, user, loadEvents])

  const activePatients = useMemo(() => patients.filter((patient) => patient.status === 'active'), [patients])
  const dueSoon = useMemo(() => activePatients.filter((patient) => daysUntil(patient.due_date) <= 14 && daysUntil(patient.due_date) >= 0), [activePatients])
  const reportedWaterBreak = useMemo(() => activePatients.filter((patient) => patient.water_break_reported), [activePatients])
  const visiblePatients = useMemo(() => activePatients.filter((patient) => {
    const matchesSearch = `${patient.full_name} ${patient.email ?? ''}`.toLowerCase().includes(query.toLowerCase())
    if (filter === 'due') return matchesSearch && daysUntil(patient.due_date) <= 14 && daysUntil(patient.due_date) >= 0
    if (filter === 'water') return matchesSearch && patient.water_break_reported
    return matchesSearch
  }), [activePatients, query, filter])
  const activePatient = patients.find((patient) => patient.id === selected) ?? null

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthBusy(true)
    setAuthMessage('')
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`,
        },
      })
      setAuthMessage(error ? (error.message.toLowerCase().includes('password') ? error.message : 'Unable to create your account. Check the details and try again.') : 'Account created. If email confirmation is enabled, check your inbox to finish signing in.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
      setAuthMessage(error ? 'Invalid email or password. If you just signed up, confirm your email first.' : '')
    }
    setAuthBusy(false)
  }

  async function addPatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return
    setSaving(true)
    const { data, error } = await supabase.from('patients').insert({
      full_name: draft.full_name.trim(), phone: draft.phone.trim() || null, email: draft.email.trim() || null,
      due_date: draft.due_date, pregnancy_notes: draft.pregnancy_notes.trim() || null,
      birth_plan: draft.birth_plan.trim() || null,
    }).select('id').single()
    if (error || !data) setNotice('Patient could not be saved. Please check the required fields and try again.')
    else {
      await supabase.from('patient_events').insert({ patient_id: data.id, event_type: 'check_in', summary: 'Patient added to maternity care' })
      setNotice(`${draft.full_name} added to your patient list.`)
      setDraft(blankPatient)
      setModal(false)
      await loadPatients()
      setSelected(data.id)
    }
    setSaving(false)
  }

  async function reportWaterBreak() {
    if (!activePatient || !user) return
    const occurredAt = new Date().toISOString()
    const { error } = await supabase.from('patients').update({ water_break_reported: true, water_break_time: occurredAt, water_break_notes: 'Reported to care team; clinician review needed.', updated_at: occurredAt }).eq('id', activePatient.id)
    if (error) { setNotice('Could not save the water-break report. Try again.'); return }
    await supabase.from('patient_events').insert({ patient_id: activePatient.id, event_type: 'water_break', summary: 'Possible water break reported', details: 'Needs prompt clinician review and follow the patient-specific care plan.', occurred_at: occurredAt })
    setNotice(`Water-break report recorded for ${activePatient.full_name}. Follow your clinical protocol and contact the patient.`)
    await loadPatients()
    await loadEvents(activePatient.id)
  }

  async function addEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activePatient || !eventDraft.trim()) return
    const { error } = await supabase.from('patient_events').insert({ patient_id: activePatient.id, event_type: 'clinical_note', summary: eventDraft.trim() })
    if (error) setNotice('Could not save the care note. Please try again.')
    else { setEventDraft(''); await loadEvents(activePatient.id); setNotice('Care note saved.') }
  }

  async function signOut() { await supabase.auth.signOut(); setPatients([]); setSelected(null) }

  if (!authReady) return <main className="auth-loading" aria-label="Loading care workspace"><div className="brand-mark"><HeartPulse /></div><p>Preparing your care workspace…</p></main>
  if (!user) return <main className="auth-page">
    <section className="auth-story"><div className="brand"><div className="brand-mark"><HeartPulse /></div><span>Bloomcare</span></div><div className="auth-story-copy"><span className="eyebrow">MATERNITY CARE, MADE CLEARER</span><h1>More connected care for every <em>new beginning.</em></h1><p>A thoughtful workspace for your maternity team to keep patient details, due dates, and care check-ins together.</p></div><div className="story-note"><ShieldCheck size={18} /> Private, staff-only patient records</div></section>
    <section className="auth-panel"><form className="auth-form" onSubmit={handleAuth}><div className="mobile-brand brand"><div className="brand-mark"><HeartPulse /></div><span>Bloomcare</span></div><span className="eyebrow">YOUR CARE WORKSPACE</span><h2>{isSignUp ? 'Create your account' : 'Welcome back'}</h2><p className="auth-subtitle">{isSignUp ? 'Start organizing your maternity care team.' : 'Sign in to continue to your patient dashboard.'}</p><label>Email address<input required type="email" autoComplete="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@clinic.com" /></label><label>Password<input required minLength={6} type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'} value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="At least 6 characters" /></label>{authMessage && <p role="status" className="form-message">{authMessage}</p>}<button className="primary-button auth-submit" disabled={authBusy}>{authBusy ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}<span aria-hidden="true">→</span></button><p className="auth-switch">{isSignUp ? 'Already have an account?' : 'New to Bloomcare?'} <button type="button" onClick={() => { setIsSignUp(!isSignUp); setAuthMessage('') }}>{isSignUp ? 'Sign in' : 'Create an account'}</button></p><p className="privacy-note"><ShieldCheck size={15} /> Protected patient information. Sign in to access records.</p></form></section>
  </main>

  return <main className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}><div className="brand"><div className="brand-mark"><HeartPulse /></div><span>Bloomcare</span></div><div className="workspace-label">MATERNITY CARE</div><nav aria-label="Main navigation"><button className="nav-item active"><Activity /> Overview</button><button className="nav-item" onClick={() => document.getElementById('patients-heading')?.scrollIntoView({ behavior: 'smooth' })}><Users /> Patients <span className="nav-count">{activePatients.length}</span></button><button className="nav-item" onClick={() => { setFilter('due'); document.getElementById('patients-heading')?.scrollIntoView({ behavior: 'smooth' }) }}><CalendarDays /> Due dates</button><button className="nav-item" onClick={() => { setFilter('water'); document.getElementById('patients-heading')?.scrollIntoView({ behavior: 'smooth' }) }}><Droplets /> Water-break reports{reportedWaterBreak.length > 0 && <span className="nav-count alert-count">{reportedWaterBreak.length}</span>}</button></nav><div className="sidebar-bottom"><div className="clinical-note"><div className="clinical-icon"><Stethoscope /></div><div><strong>Care-team workspace</strong><p>For clinician-led coordination</p></div></div><button className="profile-button" onClick={signOut}><span className="profile-avatar">{initials(user.email ?? 'Care Team')}</span><span className="profile-info"><strong>{user.email}</strong><small>Care team</small></span><LogOut size={16} aria-label="Sign out" /></button></div></aside>
    {mobileNav && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <section className="main-area"><header className="topbar"><button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(!mobileNav)}><Menu /></button><div className="breadcrumb">Care workspace <span>/</span> <strong>Overview</strong></div><div className="topbar-actions"><span className="today-label"><CalendarDays />{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span><span className="secure-label"><ShieldCheck /> Secure workspace</span></div></header>
      <div className="content"><div className="welcome-row"><div><span className="eyebrow">MATERNITY CARE OVERVIEW</span><h1>Good morning, care team</h1><p>A clear view of your active patients and their upcoming milestones.</p></div><button className="primary-button add-patient" onClick={() => { setDraft(blankPatient); setModal(true) }}><Plus /> Add patient</button></div>
        {notice && <div className="notice-banner" role="status"><Check />{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}><X /></button></div>}
        {reportedWaterBreak.length > 0 && <section className="urgent-banner" aria-label="Water-break reports require review"><div className="urgent-symbol"><Droplets /></div><div><strong>{reportedWaterBreak.length} possible water-break {reportedWaterBreak.length === 1 ? 'report' : 'reports'} need clinician review</strong><p>Follow your team&apos;s protocol and the patient-specific care plan. Do not use this dashboard to determine clinical disposition.</p></div><button onClick={() => { setFilter('water'); document.getElementById('patients-heading')?.scrollIntoView({ behavior: 'smooth' }) }}>Review reports <span>→</span></button></section>}
        <div className="stat-grid"><article className="stat-card"><div className="stat-top"><span>Active patients</span><span className="stat-icon lilac"><Users /></span></div><div className="stat-value">{activePatients.length}<span className="stat-unit">patients</span></div><p>Currently in your care</p></article><article className="stat-card"><div className="stat-top"><span>Due in 14 days</span><span className="stat-icon peach"><Baby /></span></div><div className="stat-value">{dueSoon.length}<span className="stat-unit">patients</span></div><p>Based on recorded due dates</p></article><article className="stat-card"><div className="stat-top"><span>Water-break reports</span><span className="stat-icon blue"><Droplets /></span></div><div className="stat-value">{reportedWaterBreak.length}<span className="stat-unit">to review</span></div><p>Requires clinician follow-up</p></article><article className="stat-card"><div className="stat-top"><span>Care events</span><span className="stat-icon green"><HeartPulse /></span></div><div className="stat-value">{events.length}<span className="stat-unit">recent</span></div><p>For selected patient</p></article></div>
        <div className="dashboard-grid"><section className="patients-card"><div className="section-heading"><div><span className="eyebrow">YOUR CASELOAD</span><h2 id="patients-heading">Patient overview</h2><p>Due-date timelines are coordination aids, not clinical predictions.</p></div><button className="text-button" onClick={() => { setFilter('all'); setQuery('') }}>View all <span>→</span></button></div><div className="patient-controls"><label className="search-box"><Search /><input aria-label="Search patients" placeholder="Search patients…" value={query} onChange={(e) => setQuery(e.target.value)} /></label><label className="filter-select"><span className="sr-only">Filter patients</span><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All patients</option><option value="due">Due within 14 days</option><option value="water">Water-break reports</option></select><ChevronDown /></label></div><div className="patient-list">{loading ? <div className="empty-state"><span>Loading patient records…</span></div> : visiblePatients.length === 0 ? <div className="empty-state"><div className="empty-icon"><Users /></div><strong>{query || filter !== 'all' ? 'No matching patients' : 'Your patient list is ready'}</strong><span>{query || filter !== 'all' ? 'Try another search or filter.' : 'Add a patient to start tracking due dates and care events.'}</span>{!query && filter === 'all' && <button className="secondary-button" onClick={() => setModal(true)}><Plus /> Add your first patient</button>}</div> : visiblePatients.map((patient) => { const left = daysUntil(patient.due_date); const isSoon = left <= 14 && left >= 0; return <button key={patient.id} className={`patient-row ${selected === patient.id ? 'patient-row-selected' : ''}`} onClick={() => setSelected(patient.id)} aria-pressed={selected === patient.id}><span className="patient-avatar">{initials(patient.full_name)}</span><span className="patient-main"><strong>{patient.full_name}</strong><small>{gestation(patient.due_date)} gestation · Due {prettyDate(patient.due_date)}</small></span><span className="patient-statuses">{patient.water_break_reported && <span className="status-pill status-alert"><Droplets /> Review report</span>}{isSoon && <span className="status-pill status-soon"><Clock3 /> {left === 0 ? 'Due today' : `${left} days`}</span>}</span><span className="patient-chevron">→</span></button> })}</div><div className="list-footer"><span>Showing {visiblePatients.length} of {activePatients.length} active patients</span><span><span className="live-dot" /> Synced with Supabase</span></div></section>
          <aside className="detail-column">{activePatient ? <><section className="detail-card"><div className="detail-title-row"><div><span className="eyebrow">PATIENT SNAPSHOT</span><h2>Care details</h2></div><span className="more-dots" aria-hidden="true">•••</span></div><div className="patient-identity"><span className="patient-avatar large-avatar">{initials(activePatient.full_name)}</span><div><h3>{activePatient.full_name}</h3><span className="active-tag"><span className="live-dot" /> Active patient</span></div></div><div className="due-date-panel"><span>ESTIMATED DUE DATE</span><strong>{prettyDate(activePatient.due_date)}</strong><div className="due-progress"><span style={{ width: `${Math.max(0, Math.min(100, ((280 - daysUntil(activePatient.due_date)) / 280) * 100))}%` }} /></div><div className="due-meta"><span>{gestation(activePatient.due_date)} gestation</span><strong>{daysUntil(activePatient.due_date) >= 0 ? `${daysUntil(activePatient.due_date)} days to EDD` : `${Math.abs(daysUntil(activePatient.due_date))} days past EDD`}</strong></div></div><div className="detail-fields">{activePatient.phone && <div><span>PHONE</span><strong>{activePatient.phone}</strong></div>}{activePatient.email && <div><span>EMAIL</span><strong>{activePatient.email}</strong></div>}{activePatient.birth_plan && <div><span>BIRTH PLAN</span><strong>{activePatient.birth_plan}</strong></div>}{activePatient.pregnancy_notes && <div><span>CARE NOTES</span><strong>{activePatient.pregnancy_notes}</strong></div>}</div>{activePatient.water_break_reported ? <div className="water-status"><Droplets /><div><strong>Possible water break reported</strong><span>{activePatient.water_break_time ? new Date(activePatient.water_break_time).toLocaleString() : 'Time not recorded'} · Clinician review needed</span></div></div> : <button className="water-report-button" onClick={reportWaterBreak}><Droplets /> Record possible water break</button>}<p className="clinical-caveat">This record supports coordination only. Follow your clinical protocols and the patient&apos;s individualized plan for assessment and hospital timing.</p></section>
            <section className="activity-card"><div className="activity-heading"><div><span className="eyebrow">CARE TIMELINE</span><h2>Recent activity</h2></div><span className="activity-icon"><Activity /></span></div><form className="note-form" onSubmit={addEvent}><input aria-label="Add a care note" placeholder="Add a care note…" value={eventDraft} onChange={(e) => setEventDraft(e.target.value)} /><button disabled={!eventDraft.trim()} aria-label="Save care note"><Plus /></button></form><div className="timeline">{events.length ? events.slice(0, 4).map((event) => <div className="timeline-item" key={event.id}><span className={`timeline-dot ${event.event_type === 'water_break' ? 'timeline-alert' : ''}`}>{event.event_type === 'water_break' ? <Droplets /> : <Check />}</span><div><strong>{event.summary}</strong><span>{new Date(event.occurred_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>{event.details && <small>{event.details}</small>}</div></div>) : <p className="timeline-empty">No care events yet. Notes and patient check-ins will appear here.</p>}</div></section></> : <section className="detail-card detail-empty"><div className="empty-icon"><UserRound /></div><h2>Select a patient</h2><p>Choose a patient to view due-date details and recent care activity.</p></section>}</aside></div>
        <div className="safety-footer"><div className="safety-icon"><AlertCircle /></div><p><strong>Clinical safety reminder</strong><span>This system does not triage, diagnose, or determine when someone should go to the hospital. For possible labor, ruptured membranes, reduced fetal movement, bleeding, severe pain, or any urgent concern, contact the patient&apos;s maternity care team or local emergency services immediately according to local protocol.</span></p></div>
      </div></section>
    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(false) }}><section className="patient-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><span className="eyebrow">NEW CARE RECORD</span><h2 id="modal-title">Add a patient</h2><p>Capture essential details for your care team.</p></div><button className="close-modal" aria-label="Close dialog" onClick={() => setModal(false)}><X /></button></div><form onSubmit={addPatient}><label>Patient full name<input required autoFocus value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} placeholder="e.g. Jordan Lee" /></label><div className="form-row"><label>Estimated due date<input required type="date" value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} /></label><label>Phone number<input type="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="(555) 000-0000" /></label></div><label>Email address <span className="optional-label">Optional</span><input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="patient@email.com" /></label><label>Birth plan <span className="optional-label">Optional</span><input value={draft.birth_plan} onChange={(e) => setDraft({ ...draft, birth_plan: e.target.value })} placeholder="e.g. Midwife-led care" /></label><label>Care notes <span className="optional-label">Optional</span><textarea rows={3} value={draft.pregnancy_notes} onChange={(e) => setDraft({ ...draft, pregnancy_notes: e.target.value })} placeholder="Relevant care notes for your team" /></label><div className="modal-footnote"><ShieldCheck /> Patient records are private to your signed-in care account.</div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save patient'}<span aria-hidden="true">→</span></button></div></form></section></div>}
  </main>
}
