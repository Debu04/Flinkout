import { SocialFeed } from '../components/social-feed';
import Link from 'next/link';

export default function Home() {
  return <section className="home-layout">
    <div className="feed-column stack">
      <header className="home-header">
        <div><span className="eyebrow">YOUR COMMUNITY</span><h1>Good morning 👋</h1><p>See how your people are moving today.</p></div>
        <Link className="button compact" href="/record">Start activity</Link>
      </header>
      <div className="story-strip" aria-label="Community highlights">
        {['You', 'Maya', 'Arjun', 'Neha', 'Kabir'].map((name, index) => <div className="story" key={name}><span className={index === 0 ? 'story-avatar add' : 'story-avatar'}>{index === 0 ? '+' : name[0]}</span><small>{name}</small></div>)}
      </div>
      <div className="section-heading"><div><span className="eyebrow">LATEST</span><h2>Activity feed</h2></div><Link href="/explore">Explore all</Link></div>
      <SocialFeed />
    </div>
    <aside className="home-aside stack">
      <section className="card weekly-card"><span className="eyebrow">THIS WEEK</span><h2>Keep the rhythm</h2><div className="progress-ring"><strong>24.6</strong><small>km</small></div><div className="weekly-meta"><span><strong>4</strong> activities</span><span><strong>2h 48m</strong> moving</span></div></section>
      <section className="card suggestion-card"><div className="section-heading"><h3>People to follow</h3><Link href="/explore">See all</Link></div>{['Neha Singh', 'Kabir Shah'].map((name, i) => <div className="suggestion" key={name}><span className="avatar small">{name[0]}</span><span className="grow"><strong>{name}</strong><small>{i ? 'Cycling · 2 km away' : 'Running · 1.4 km away'}</small></span><button>Follow</button></div>)}</section>
    </aside>
  </section>;
}
