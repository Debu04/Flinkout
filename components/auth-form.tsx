'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { UiIcon } from './ui-icon';

type AuthValues = {
  displayName: string;
  username: string;
  email: string;
  password: string;
};

const emptyValues: AuthValues = { displayName: '', username: '', email: '', password: '' };

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (!message || message === 'Failed to fetch' || message === 'Request failed') {
    return 'Flinkout could not reach the account service. Your details are still here—check the connection and try again.';
  }
  return message;
}

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const [values, setValues] = useState<AuthValues>(emptyValues);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const register = mode === 'register';

  function update(key: keyof AuthValues, value: string) {
    setValues(current => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = register ? values : { email: values.email, password: values.password };
      await api(`/auth/${register ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify(payload) });
      const requested = new URLSearchParams(window.location.search).get('next');
      window.location.assign(requested?.startsWith('/') ? requested : '/');
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  }

  return <section className="auth-card">
    <Link className="auth-brand" href="/" aria-label="Flinkout home"><span className="brand-mark">F</span><strong>Flinkout</strong></Link>
    <div className="auth-heading">
      <span className="eyebrow">{register ? 'YOUR MOVEMENT COMMUNITY' : 'WELCOME BACK'}</span>
      <h1>{register ? 'Create your account' : 'Keep moving together'}</h1>
      <p>{register ? 'Track walks, runs, rides, and hikes—then share only what you choose.' : 'Sign in to continue your activity history and community.'}</p>
    </div>
    <form className="auth-form" onSubmit={submit}>
      {register && <>
        <label className="field">Display name<input required name="displayName" maxLength={60} autoComplete="name" value={values.displayName} onChange={event => update('displayName', event.target.value)} placeholder="How people will know you" /></label>
        <label className="field">Username<input required name="username" pattern="[a-z0-9_]{3,30}" title="3–30 lowercase letters, numbers, or underscores" autoComplete="username" value={values.username} onChange={event => update('username', event.target.value.toLowerCase())} placeholder="your_handle" /><small>3–30 lowercase letters, numbers, or underscores.</small></label>
      </>}
      <label className="field">Email<input required name="email" type="email" autoComplete="email" value={values.email} onChange={event => update('email', event.target.value)} placeholder="you@example.com" /></label>
      <label className="field auth-password-field">Password<span><input required name="password" type={showPassword ? 'text' : 'password'} minLength={register ? 10 : 1} autoComplete={register ? 'new-password' : 'current-password'} value={values.password} onChange={event => update('password', event.target.value)} placeholder={register ? 'At least 10 characters' : 'Your password'} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)}><UiIcon name={showPassword ? 'eyeOff' : 'eye'} /></button></span>{register && <small>Use at least 10 characters. A passphrase is easiest to remember.</small>}</label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="auth-submit" disabled={busy}>{busy ? 'Connecting…' : register ? 'Create account' : 'Log in'}</button>
    </form>
    {register && <p className="auth-terms">By creating an account, you agree to move respectfully and protect other people’s location privacy.</p>}
    <p className="auth-switch">{register ? <>Already a member? <Link href="/login">Log in</Link></> : <>New to Flinkout? <Link href="/register">Create an account</Link></>}</p>
  </section>;
}
