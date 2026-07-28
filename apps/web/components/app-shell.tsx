'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { UiIcon } from './ui-icon';

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

  useEffect(() => { setMenuOpen(false); setNotificationsOpen(false); }, [path]);

  if (path.startsWith('/login') || path.startsWith('/register')) return <main className="auth">{children}</main>;
  const ownsHeader = path.startsWith('/activities/') || path.startsWith('/u/');

  function search(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    router.push(`/explore?q=${encodeURIComponent(query.trim())}`);
  }

  return <div className={`layout ${ownsHeader ? 'owns-mobile-header' : ''}`}>
    <header className="desktop-topbar">
      <Link className="topbar-brand" href="/"><span className="brand-mark">F</span><strong>Flinkout</strong></Link>
      <form className="topbar-search" onSubmit={search}>
        <label className="sr-only" htmlFor="global-search">Search Flinkout</label><button aria-label="Submit Flinkout search"><UiIcon name="search" size={20} /></button>
        <input id="global-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Explore trails, groups, or friends…" />
      </form>
      <div className="topbar-actions">
        <button aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(value => !value)}><UiIcon name="bell" /><span className="notification-dot" /></button>
        <Link href="/messages" aria-label="Messages"><UiIcon name="chat" /></Link>
        <Link href="/profile/edit" aria-label="Settings"><UiIcon name="settings" /></Link>
      </div>
    </header>

    {!ownsHeader && <header className="mobile-topbar">
      <button className="mobile-menu" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><span /><span /><span /></button>
      <Link href="/" className="mobile-wordmark">Flinkout</Link>
      <button className="mobile-notification" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(value => !value)}><UiIcon name="bell" /><span /></button>
      <Link href="/u/marcus_moves" className="mobile-profile-link" aria-label="Open profile">M</Link>
    </header>}

    {notificationsOpen && <aside className="notification-panel" aria-label="Notifications">
      <header><strong>Notifications</strong><button onClick={() => setNotificationsOpen(false)} aria-label="Close notifications">×</button></header>
      <Link href="/activities/demo-run"><span className="avatar small">S</span><span><strong>Sienna sent a high-five</strong><small>On your morning walk · 4m</small></span></Link>
      <Link href="/messages"><span className="avatar small">M</span><span><strong>Marcus sent a message</strong><small>“See you at the trailhead” · 12m</small></span></Link>
      <Link href="/explore"><span className="avatar small">T</span><span><strong>Trail Cleanup starts soon</strong><small>0.8 km away · 25m</small></span></Link>
    </aside>}

    {menuOpen && <div className="mobile-drawer-layer" role="presentation" onClick={() => setMenuOpen(false)}>
      <aside className="mobile-drawer" aria-label="Expanded navigation" onClick={event => event.stopPropagation()}>
        <header><Link href="/" className="mobile-wordmark">Flinkout</Link><button onClick={() => setMenuOpen(false)} aria-label="Close navigation">×</button></header>
        <Link href="/u/marcus_moves" className="drawer-profile"><span className="avatar">M</span><span><strong>Marcus Rivera</strong><small>@marcus_moves</small></span></Link>
        <p className="drawer-section-label">More from Flinkout</p>
        {mobileDrawerNavigation.map(item => <Link key={item.href} href={item.href} aria-current={path === item.href ? 'page' : undefined}><UiIcon name={item.icon} /><span>{item.label}</span></Link>)}
        <Link href="/record" className="drawer-record"><UiIcon name="play" /> Start Movement</Link>
      </aside>
    </div>}

    <nav className="nav" aria-label="Primary navigation">
      <section className="nav-profile" aria-label="Current user">
        <span className="avatar nav-avatar">M</span>
        <strong>Outdoor Explorer</strong><small>Level 12 Trailblazer</small>
      </section>
      <div className="desktop-nav-links">
        {desktopNavigation.map(item => <Link key={item.href} href={item.href} aria-current={path === item.href ? 'page' : undefined}><UiIcon name={item.icon} /><span>{item.label}</span></Link>)}
      </div>
      <Link className="nav-start-button" href="/record"><UiIcon name="play" />Start Activity</Link>
      <p className="nav-foot">Move together, safely.</p>
      <div className="mobile-nav-links">
        {mobileNavigation.map(item => <Link key={item.href} href={item.href} aria-current={path === item.href ? 'page' : undefined}><UiIcon name={item.icon} /><span>{item.label}</span></Link>)}
      </div>
    </nav>
    {!path.startsWith('/record') && <Link href="/record" className="mobile-start-fab"><UiIcon name="activity" /><span>Start</span></Link>}
    <main className="main">{children}</main>
  </div>;
}
