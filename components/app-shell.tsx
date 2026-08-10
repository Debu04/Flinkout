'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { UiIcon } from './ui-icon';
import { useAppSession, usePreviewState } from './interaction-provider';
import { MessengerPopup } from './messages-client';

const desktopNavigation = [
  { href: '/', label: 'Home', icon: 'home' as const },
  { href: '/explore', label: 'Search', icon: 'search' as const },
  { href: '/map', label: 'Map', icon: 'map' as const },
  { href: '/messages', label: 'Messages', icon: 'chat' as const },
  { href: '/profile', label: 'My Activity', icon: 'activity' as const },
  { href: '/clubs', label: 'Clubs', icon: 'group' as const },
  { href: '/profile/edit', label: 'Settings', icon: 'settings' as const },
];

const mobileNavigation = [
  { href: '/', label: 'Home', icon: 'home' as const },
  { href: '/explore', label: 'Search', icon: 'search' as const },
  { href: '/map', label: 'Map', icon: 'map' as const },
  { href: '/messages', label: 'Messages', icon: 'chat' as const },
];

const mobileDrawerNavigation = [
  { href: '/profile', label: 'My Activity', icon: 'activity' as const },
  { href: '/clubs', label: 'Clubs', icon: 'group' as const },
  { href: '/profile/edit', label: 'Settings', icon: 'settings' as const },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [messengerOpen, setMessengerOpen] = useState(false);
  const notificationsRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const notificationsButtonRef = useRef<HTMLButtonElement>(null);
  const messengerButtonRef = useRef<HTMLButtonElement>(null);
  const { state, markNotificationsRead } = usePreviewState();
  const { viewer, mode } = useAppSession();
  const viewerName = viewer.profile?.displayName ?? viewer.username;
  const viewerInitial = viewerName[0]?.toUpperCase() ?? 'F';

  useEffect(() => { setMenuOpen(false); setNotificationsOpen(false); setMessengerOpen(false); }, [path]);
  useEffect(() => {
    if (!menuOpen && !notificationsOpen && !messengerOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (menuOpen) {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
      if (notificationsOpen) {
        setNotificationsOpen(false);
        notificationsButtonRef.current?.focus();
      }
      if (messengerOpen) {
        setMessengerOpen(false);
        messengerButtonRef.current?.focus();
      }
    }
    function closeNotifications(event: MouseEvent) {
      if (notificationsOpen && notificationsRef.current && !notificationsRef.current.contains(event.target as Node) && event.target !== notificationsButtonRef.current) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('mousedown', closeNotifications);
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('mousedown', closeNotifications);
      document.body.style.overflow = '';
    };
  }, [menuOpen, messengerOpen, notificationsOpen]);

  if (path.startsWith('/login') || path.startsWith('/register')) return <main className="auth">{children}</main>;
  const ownsHeader = path.startsWith('/activities/') || path.startsWith('/u/');

  function search(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    router.push(`/explore?q=${encodeURIComponent(query.trim())}`);
  }
  function isActive(href: string) {
    return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
  }
  function toggleNotifications() {
    setNotificationsOpen(value => {
      const next = !value;
      if (next) markNotificationsRead();
      return next;
    });
  }

  return <div className={`layout ${ownsHeader ? 'owns-mobile-header' : ''} ${mode.toLowerCase()}-mode ${path.startsWith('/messages') ? 'messages-route' : ''}`}>
    <header className="desktop-topbar">
      <Link className="topbar-brand" href="/"><span className="brand-mark">F</span><strong>Flinkout</strong></Link>
      <form className="topbar-search" onSubmit={search}>
        <label className="sr-only" htmlFor="global-search">Search Flinkout</label><button aria-label="Submit Flinkout search"><UiIcon name="search" size={20} /></button>
        <input id="global-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Explore trails, groups, or friends…" />
      </form>
      <div className="topbar-actions">
        <button ref={notificationsButtonRef} aria-label="Notifications" aria-expanded={notificationsOpen} onClick={toggleNotifications}><UiIcon name="bell" />{!state.notificationsRead && <span className="notification-dot" />}</button>
        <button ref={messengerButtonRef} aria-label="Messages" aria-expanded={messengerOpen} aria-pressed={messengerOpen} onClick={() => { setMessengerOpen(value => !value); setNotificationsOpen(false); }}><UiIcon name="chat" /></button>
        <Link href="/profile/edit" aria-label="Settings"><UiIcon name="settings" /></Link>
      </div>
    </header>

    {!ownsHeader && <header className="mobile-topbar">
      <button ref={menuButtonRef} className="mobile-menu" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><span /><span /><span /></button>
      <Link href="/" className="mobile-wordmark">Flinkout</Link>
      <button ref={notificationsButtonRef} className="mobile-notification" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={toggleNotifications}><UiIcon name="bell" />{!state.notificationsRead && <span />}</button>
      <Link href="/profile" className="mobile-profile-link" aria-label="Open my profile">{viewer.profile?.photoUrl ? <img src={viewer.profile.photoUrl} alt="" /> : viewerInitial}</Link>
    </header>}

    {notificationsOpen && <aside ref={notificationsRef} className="notification-panel" aria-label="Notifications" aria-live="polite">
      <header><span><strong>Notifications</strong>{mode !== 'CONNECTED' && <small>Preview</small>}</span><button onClick={() => setNotificationsOpen(false)} aria-label="Close notifications">×</button></header>
      {mode === 'CONNECTED' ? <div className="notification-empty"><UiIcon name="bell" /><strong>You’re all caught up</strong><p>New high-fives, follows, and session updates will appear here.</p></div> : <>
        <Link href="/activities/demo-run"><span className="avatar small">S</span><span><strong>Sienna sent a high-five</strong><small>On your morning walk · 4m</small></span></Link>
        <Link href="/messages"><span className="avatar small">E</span><span><strong>Elena sent a message</strong><small>“See you at the trailhead” · 12m</small></span></Link>
        <Link href="/explore"><span className="avatar small">T</span><span><strong>Trail Cleanup starts soon</strong><small>0.8 km away · 25m</small></span></Link>
      </>}
    </aside>}

    {menuOpen && <div className="mobile-drawer-layer" role="presentation" onClick={() => setMenuOpen(false)}>
      <aside className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Expanded navigation" onClick={event => event.stopPropagation()}>
        <header><Link href="/" className="mobile-wordmark">Flinkout</Link><button onClick={() => setMenuOpen(false)} aria-label="Close navigation">×</button></header>
        <Link href="/profile" className="drawer-profile"><span className="avatar">{viewerInitial}</span><span><strong>{viewerName}</strong><small>@{viewer.username}</small></span></Link>
        {mode !== 'CONNECTED' && <p className="drawer-preview-note">Preview workspace · actions stay on this device</p>}
        <p className="drawer-section-label">More from Flinkout</p>
        {mobileDrawerNavigation.map(item => <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}><UiIcon name={item.icon} /><span>{item.label}</span></Link>)}
      </aside>
    </div>}

    <nav className="nav" aria-label="Primary navigation">
      <Link href="/profile" className="nav-profile" aria-label="Open my profile">
        <span className="avatar nav-avatar">{viewerInitial}</span>
        <strong>{viewerName}</strong><small>@{viewer.username}</small>
      </Link>
      <div className="desktop-nav-links">
        {desktopNavigation.map(item => item.href === '/messages'
          ? <button key={item.href} className={messengerOpen ? 'active' : ''} aria-expanded={messengerOpen} onClick={() => { setMessengerOpen(value => !value); setNotificationsOpen(false); }}><UiIcon name={item.icon} /><span>{item.label}</span></button>
          : <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}><UiIcon name={item.icon} /><span>{item.label}</span></Link>)}
      </div>
      <Link className="nav-start-button" href="/record"><UiIcon name="play" />Start Activity</Link>
      <p className="nav-foot">Move together, safely.</p>
      <div className="mobile-nav-links">
        {mobileNavigation.map(item => <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}><UiIcon name={item.icon} /><span>{item.label}</span></Link>)}
      </div>
    </nav>
    {mode !== 'CONNECTED' && <div className={`connection-banner ${mode === 'CHECKING' ? 'checking' : ''}`} role="status">
      <span className="connection-dot" />
      <span><strong>{mode === 'CHECKING' ? 'Checking your connection' : 'Preview workspace'}</strong><small>{mode === 'CHECKING' ? 'Loading your account…' : 'Social updates are saved on this device until you sign in.'}</small></span>
      {mode === 'PREVIEW' && <Link href="/login">Sign in</Link>}
    </div>}
    <Link href="/record" className="mobile-start-fab" aria-current={path.startsWith('/record') ? 'page' : undefined}><UiIcon name="activity" /><span>Start</span></Link>
    <MessengerPopup open={messengerOpen} onClose={() => { setMessengerOpen(false); messengerButtonRef.current?.focus(); }} />
    <main className="main">{children}</main>
  </div>;
}
