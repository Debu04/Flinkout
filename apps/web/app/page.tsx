'use client';

import Link from 'next/link';
import { useAppSession, useInteractions, usePreviewState } from '../components/interaction-provider';
import { SocialFeed } from '../components/social-feed';
import { UiIcon } from '../components/ui-icon';

const livePeople = [
  { name: 'Sienna', username: 'sienna_trails', initial: 'S', tone: 'mountain' },
  { name: 'Tara', username: 'trail_seeker', initial: 'T', tone: 'forest' },
  { name: 'Elena', username: 'elena_trails', initial: 'E', tone: 'sunrise' },
  { name: 'James', username: 'james_moves', initial: 'J', tone: 'trail' },
  { name: 'Henry', username: 'hiking_henry', initial: 'H', tone: 'blue' },
];

function LiveNearby() {
  const { mode } = useAppSession();
  if (mode === 'CONNECTED') return <section className="live-nearby live-nearby-connected">
    <div className="trail-section-heading"><h1><span className="live-pulse" />Live Nearby</h1><Link href="/map">Open map</Link></div>
    <Link href="/map" className="live-home-empty"><UiIcon name="radio" /><span><strong>Find active people near you</strong><small>Choose Locate on the map to search using your approximate position.</small></span><b>Explore</b></Link>
  </section>;
  return <section className="live-nearby">
    <div className="trail-section-heading"><h1><span className="live-pulse" />Live Nearby <small>Preview</small></h1><Link href="/map">View map</Link></div>
    <div className="live-people" aria-label="Sample people sharing live activities nearby">
      {livePeople.map(person => <Link href={`/u/${person.username}`} className="live-person" key={person.username}>
        <span className={`live-avatar ${person.tone}`}><span>{person.initial}</span><b>LIVE</b></span>
        <small>{person.name}</small>
      </Link>)}
    </div>
  </section>;
}

function StartingSoon() {
  const { state, toggleSession } = usePreviewState();
  const { notify } = useInteractions();
  const sessions = [
    { id: 'misty', activityId: 'demo-walk', minutes: 18, name: 'Sunday Sunrise Walk', location: 'East Side Park', faces: 'M T E', count: 12 },
    { id: 'river', activityId: 'demo-run', minutes: 45, name: 'Hill Training Session', location: 'Peak Trail Entrance', faces: 'J K', count: 4 },
  ];

  function join(id: string, name: string) {
    const active = state.joinedSessionIds.includes(id);
    toggleSession(id);
    notify(active ? `You left ${name}.` : `You joined ${name}. We will remind you before it starts.`);
  }

  return <section className="trail-panel">
    <header><h2>Starting Soon</h2><span className="panel-icon" aria-hidden>EVENT</span></header>
    {sessions.map((session, index) => {
      const joined = state.joinedSessionIds.includes(session.id);
      return <article className="event-card" key={session.id}>
        <Link href={`/activities/${session.activityId}`}><span className={`event-time ${index ? 'orange' : ''}`}><strong>{session.minutes}</strong><small>MIN</small></span><span><strong>{session.name}</strong><small>{session.location}</small><p><span className="mini-faces">{session.faces}</span> +{session.count} joining</p></span></Link>
        <button className={joined ? 'joined' : ''} onClick={() => join(session.id, session.name)}>{joined ? 'Joined' : 'Join'}</button>
      </article>;
    })}
    <Link className="panel-button" href="/explore">View all events</Link>
  </section>;
}

function BuddyDiscovery() {
  const { state, toggleFollow } = usePreviewState();
  const { notify } = useInteractions();
  const people = [
    { name: 'Sienna Williams', username: 'sienna_trails', detail: 'Frequent trail runner', initial: 'S' },
    { name: 'Elena Rodriguez', username: 'elena_trails', detail: 'Community walk leader', initial: 'E' },
  ];

  return <section className="trail-panel">
    <header><h2>Buddy Discovery</h2><Link href="/explore">See all</Link></header>
    {people.map(person => {
      const following = state.followingUsernames.includes(person.username);
      return <div className="buddy" key={person.username}><Link href={`/u/${person.username}`} className="avatar small">{person.initial}</Link><span className="grow"><strong>{person.name}</strong><small>{person.detail}</small></span><button className={following ? 'following' : ''} aria-label={`${following ? 'Unfollow' : 'Follow'} ${person.name}`} onClick={() => {
        toggleFollow(person.username);
        notify(following ? `You unfollowed ${person.name}.` : `You are now following ${person.name}.`);
      }}>{following ? 'Following' : 'Follow'}</button></div>;
    })}
  </section>;
}

function LocalHeatmap() {
  return <section className="trail-panel heatmap-preview">
    <header><h2>Local Activity<br />Heatmap</h2><span className="panel-icon" aria-hidden>MAP</span></header>
    <Link href="/map" className="mini-map" aria-label="Open local activity heatmap"><span className="map-road one" /><span className="map-road two" /><span className="map-water" /><span className="map-radius" /><i className="map-pin pin-one">S</i><i className="map-pin pin-two">E</i></Link>
    <footer><span><small>DISCOVERY RADIUS</small><strong>5 km</strong></span><span><i /> Live Movement</span></footer>
  </section>;
}

export default function Home() {
  const { notify } = useInteractions();
  const { mode } = useAppSession();
  return <section className="trail-home">
    <div className="trail-feed-column">
      <LiveNearby />
      <SocialFeed />
    </div>
    <aside className="trail-aside">
      {mode === 'CONNECTED' ? <section className="trail-panel connected-quick-actions"><header><h2>Quick actions</h2><span className="panel-icon">READY</span></header><Link href="/record"><UiIcon name="activity" /><span><strong>Start an activity</strong><small>Record with offline backup</small></span></Link><Link href="/map"><UiIcon name="map" /><span><strong>Find live movement</strong><small>Use approximate nearby discovery</small></span></Link><Link href="/profile"><UiIcon name="profile" /><span><strong>My activity</strong><small>Review your movement history</small></span></Link></section> : <>
        <StartingSoon />
        <BuddyDiscovery />
        <LocalHeatmap />
      </>}
      <section className="premium-banner"><span>PREMIUM TRAIL GUIDE</span><strong>Unlock 500+ Hidden Trails</strong><button onClick={() => notify('Premium plans are coming soon. You are on the preview list.')}>Go premium</button></section>
    </aside>
  </section>;
}
