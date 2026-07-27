'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '../lib/api';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(form: FormData) { setBusy(true); setError(''); try { await api(`/auth/${mode === 'login' ? 'login' : 'register'}`, { method:'POST', body:JSON.stringify(Object.fromEntries(form)) }); router.replace('/profile'); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Please try again'); } finally { setBusy(false); } }
  return <section className="card stack"><div><div className="brand-title">Flinkout</div><h1>{mode === 'login' ? 'Welcome back' : 'Join the movement'}</h1><p className="hint">{mode === 'login' ? 'Sign in to continue.' : 'Create your fitness community account.'}</p></div><form className="stack" action={submit}>{mode === 'register' && <><label className="field">Display name<input required name="displayName" maxLength={60} autoComplete="name" /></label><label className="field">Username<input required name="username" pattern="[a-z0-9_]{3,30}" title="3–30 lowercase letters, numbers, or underscores" autoComplete="username" /></label></>}<label className="field">Email<input required name="email" type="email" autoComplete="email" /></label><label className="field">Password<input required name="password" type="password" minLength={mode === 'register' ? 10 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>{error && <p className="error" role="alert">{error}</p>}<button className="button" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</button></form><p className="hint">{mode === 'login' ? <>New here? <Link href="/register">Create an account</Link></> : <>Already a member? <Link href="/login">Log in</Link></>}</p></section>;
}
