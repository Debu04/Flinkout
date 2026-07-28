'use client';

import Link from 'next/link';
import { useInteractions, usePreviewState } from '../../components/interaction-provider';

const clubs = [
  { id: 'sunrise', name: 'Sunday Sunrise Crew', members: 248, description: 'Easy weekend walks, coffee, and good company.', tone: 'mint' },
  { id: 'ridge', name: 'Ridge Runners LA', members: 132, description: 'Trail runs and elevation sessions across the city.', tone: 'blue' },
  { id: 'cleanup', name: 'Trail Cleanup Team', members: 86, description: 'Community movement with a purpose.', tone: 'peach' },
];

export default function ClubsPage() {
  const { state, toggleClub } = usePreviewState();
  const { notify } = useInteractions();
  function toggle(id: string, name: string) {
    const isJoined = state.joinedClubIds.includes(id);
    toggleClub(id);
    notify(isJoined ? `You left ${name}.` : `You joined ${name}.`);
  }
  return <section className="clubs-page">
    <header className="clubs-hero"><span>MOVE WITH YOUR PEOPLE</span><h1>Clubs</h1><p>Find recurring groups, local sessions, and new movement buddies.</p></header>
    <div className="club-grid">{clubs.map(club => <article className="club-card" key={club.id}>
      <div className={`club-cover ${club.tone}`}><span>{club.name.split(' ').map(word => word[0]).join('').slice(0, 2)}</span></div>
      <div><small>{club.members + (state.joinedClubIds.includes(club.id) ? 1 : 0)} members</small><h2>{club.name}</h2><p>{club.description}</p><footer><Link href={`/explore?q=${encodeURIComponent(club.name)}`}>View sessions</Link><button className={state.joinedClubIds.includes(club.id) ? 'joined' : ''} aria-label={`${state.joinedClubIds.includes(club.id) ? 'Leave' : 'Join'} ${club.name}`} onClick={() => toggle(club.id, club.name)}>{state.joinedClubIds.includes(club.id) ? 'Joined' : 'Join club'}</button></footer></div>
    </article>)}</div>
  </section>;
}
