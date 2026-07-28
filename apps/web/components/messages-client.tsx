'use client';

import { useState } from 'react';
import { useInteractions } from './interaction-provider';

const chats = [
  { id: 'marcus', name: 'Marcus Rivera', preview: 'See you at the trailhead…', time: '2m ago', initial: 'M', online: true },
  { id: 'elena', name: 'Elena Rodriguez', preview: 'Great pace today! 🔥', time: '1h ago', initial: 'E' },
  { id: 'julian', name: 'Julian Chen', preview: 'Shared a new route with you.', time: 'Yesterday', initial: 'J' },
  { id: 'riley', name: 'Riley (The Walker)', preview: 'Woof! That was a great loop.', time: '2d ago', initial: 'R' },
];

export function MessagesClient() {
  const [tab, setTab] = useState<'CHATS' | 'GROUPS'>('CHATS');
  const [selected, setSelected] = useState<(typeof chats)[number] | null>(null);
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState<string[]>([]);
  const { notify } = useInteractions();

  function send(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    setSent(current => [...current, draft.trim()]);
    setDraft('');
    notify('Message sent.');
  }

  if (selected) return <section className="messages-page conversation-page">
    <header className="conversation-header"><button onClick={() => setSelected(null)} aria-label="Back to conversations">←</button><span className="avatar small">{selected.initial}</span><span><strong>{selected.name}</strong><small>{selected.online ? 'Active now' : 'Flinkout message'}</small></span></header>
    <div className="conversation-thread">
      <time>Today</time>
      <p className="message-bubble incoming">Hey! Are we still meeting at the trailhead?</p>
      <p className="message-bubble outgoing">Absolutely. I’ll be there ten minutes early.</p>
      <p className="message-bubble incoming">{selected.preview}</p>
      {sent.map((message, index) => <p className="message-bubble outgoing" key={`${message}-${index}`}>{message}</p>)}
    </div>
    <form className="message-composer" onSubmit={send}><label className="sr-only" htmlFor="message-draft">Message {selected.name}</label><input id="message-draft" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Write a message…" /><button disabled={!draft.trim()}>Send</button></form>
  </section>;

  const visible = tab === 'CHATS' ? chats : chats.slice(0, 2).map(chat => ({ ...chat, id: `group-${chat.id}`, name: chat.name === 'Marcus Rivera' ? 'Sunday Sunrise Crew' : 'Trail Cleanup Team' }));
  return <section className="messages-page">
    <div className="messages-tabs" role="tablist" aria-label="Message categories">
      <button role="tab" aria-selected={tab === 'CHATS'} onClick={() => setTab('CHATS')}>Chats</button>
      <button role="tab" aria-selected={tab === 'GROUPS'} onClick={() => setTab('GROUPS')}>Groups</button>
    </div>
    <button className="live-chat-card" onClick={() => setSelected({ ...chats[0], id: 'live-walk', name: 'Morning Harbor Loop' })}>
      <div><span className="live-dot" /> LIVE WALK SESSION <b>Now</b></div>
      <h1>Morning Harbor Loop<br />Chat</h1>
      <p><span className="chat-faces">M E J</span><strong>+12</strong><span>Just passing the 2km mark…</span></p>
    </button>
    <h2 className="messages-label">{tab === 'CHATS' ? 'Recent Messages' : 'Your Groups'}</h2>
    <div className="message-list">
      {visible.map(chat => <button className="message-row" key={chat.id} onClick={() => setSelected(chat)}>
        <span className={`avatar message-avatar ${chat.online ? 'online' : ''}`}>{chat.initial}</span>
        <span><strong>{chat.name}</strong><small>{chat.preview}</small></span>
        <time>{chat.time}</time>{chat.online && <i />}
      </button>)}
    </div>
  </section>;
}
