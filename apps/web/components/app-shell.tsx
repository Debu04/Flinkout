'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { UiIcon } from './ui-icon';
import { usePreviewState } from './interaction-provider';

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
  const notificationsRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const notificationsButtonRef = useRef<HTMLButtonElement>(null);
  const { state, markNotificationsRead } = usePreviewState();

  useEffect(() => { setMenuOpen(false); setNotificationsOpen(false); }, [path]);
  useEffect(() => {
    if (!menuOpen && !notificationsOpen) return;
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
  }, [menuOpen, notificationsOpen]);

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

  return <div className={`layout ${ownsHeader ? 'owns-mobile-header' : ''}`}>
    <header className="desktop-topbar">
      <Link className="topbar-brand" href="/"><span className="brand-mark">F</span><strong>Flinkout</strong></Link>
      <form className="topbar-search" onSubmit={search}>
        <label className="sr-only" htmlFor="global-search">Search Flinkout</label><button aria-label="Submit Flinkout search"><UiIcon name="search" size={20} /></button>
        <input id="global-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Explore trails, groups, or friends…" />
      </form>
      <div className="topbar-actions">
        <button ref={notificationsButtonRef} aria-label="Notifications" aria-expanded={notificationsOpen} onClick={toggleNotifications}><UiIcon name="bell" />{!state.notificationsRead && <span className="notification-dot" />}</button>
        <Link href="/messages" aria-label="Messages"><UiIcon name="chat" /></Link>
        <Link href="/profile/edit" aria-label="Settings"><UiIcon name="settings" /></Link>
      </div>
    </header>

    {!ownsHeader && <header className="mobile-topbar">
      <button ref={menuButtonRef} className="mobile-menu" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><span /><span /><span /></button>
      <Link href="/" className="mobile-wordmark">Flinkout</Link>
      <button ref={notificationsButtonRef} className="mobile-notification" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={toggleNotifications}><UiIcon name="bell" />{!state.notificationsRead && <span />}</button>
      <Link href="/profile" className="mobile-profile-link" aria-label="Open my profile">M</Link>
    </header>}

    {notificationsOpen && <aside ref={notificationsRef} className="notification-panel" aria-label="Notifications" aria-live="polite">
      <header><strong>Notifications</strong><button onClick={() => setNotificationsOpen(false)} aria-label="Close notifications">×</button></header>
      <Link href="/activities/demo-run"><span className="avatar small">S</span><span><strong>Sienna sent a high-five</strong><small>On your morning walk · 4m</small></span></Link>
      <Link href="/messages"><span className="avatar small">M</span><span><strong>Marcus sent a message</strong><small>“See you at the trailhead” · 12m</small></span></Link>
      <Link href="/explore"><span className="avatar small">T</span><span><strong>Trail Cleanup starts soon</strong><small>0.8 km away · 25m</small></span></Link>
    </aside>}

    {menuOpen && <div className="mobile-drawer-layer" role="presentation" onClick={() => setMenuOpen(false)}>
      <aside className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Expanded navigation" onClick={event => event.stopPropagation()}>
        <header><Link href="/" className="mobile-wordmark">Flinkout</Link><button onClick={() => setMenuOpen(false)} aria-label="Close navigation">×</button></header>
        <Link href="/profile" className="drawer-profile"><span className="avatar">M</span><span><strong>Marcus Rivera</strong><small>@marcus_moves</small></span></Link>
        <p className="drawer-section-label">More from Flinkout</p>
        {mobileDrawerNavigation.map(item => <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}><UiIcon name={item.icon} /><span>{item.label}</span></Link>)}
      </aside>
    </div>}

    <nav className="nav" aria-label="Primary navigation">
      <Link href="/profile" className="nav-profile" aria-label="Open my profile">
        <span className="avatar nav-avatar">M</span>
        <strong>Marcus Rivera</strong><small>@marcus_moves</small>
      </Link>
      <div className="desktop-nav-links">
        {desktopNavigation.map(item => <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}><UiIcon name={item.icon} /><span>{item.label}</span></Link>)}
      </div>
      <Link className="nav-start-button" href="/record"><UiIcon name="play" />Start Activity</Link>
      <p className="nav-foot">Move together, safely.</p>
      <div className="mobile-nav-links">
        {mobileNavigation.map(item => <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}><UiIcon name={item.icon} /><span>{item.label}</span></Link>)}
      </div>
    </nav>
    {!path.startsWith('/record') && <Link href="/record" className="mobile-start-fab"><UiIcon name="activity" /><span>Start</span></Link>}
    <main className="main">{children}</main>
  </div>;
}
