'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppSession, useInteractions, usePreviewState } from './interaction-provider';
import { UiIcon } from './ui-icon';

type Conversation = {
  id: string;
  name: string;
  preview: string;
  time: string;
  initial: string;
  online?: boolean;
  group?: boolean;
  baseMessages: { direction: 'incoming' | 'outgoing'; body: string }[];
};

const chats: Conversation[] = [
  { id: 'sienna', name: 'Sienna Williams', preview: 'See you at the trailhead.', time: '2m ago', initial: 'S', online: true, baseMessages: [{ direction: 'incoming', body: 'Hey! Are we still meeting at the trailhead?' }, { direction: 'outgoing', body: 'Absolutely. I will be there ten minutes early.' }, { direction: 'incoming', body: 'See you at the trailhead.' }] },
  { id: 'elena', name: 'Elena Rodriguez', preview: 'Great pace today!', time: '1h ago', initial: 'E', baseMessages: [{ direction: 'incoming', body: 'Great pace today! The whole group loved that loop.' }, { direction: 'outgoing', body: 'Thank you! Let us do it again next week.' }] },
  { id: 'james', name: 'James Chen', preview: 'Shared a new route with you.', time: 'Yesterday', initial: 'J', baseMessages: [{ direction: 'incoming', body: 'I shared a quieter greenway route with you.' }, { direction: 'outgoing', body: 'Saved it. That looks perfect for Saturday.' }] },
  { id: 'henry', name: 'Henry Walker', preview: 'The ridge is clear this weekend.', time: '2d ago', initial: 'H', baseMessages: [{ direction: 'incoming', body: 'The ridge is clear this weekend if you want to join.' }] },
];

const groups: Conversation[] = [
  { id: 'group-sunrise', name: 'Sunday Sunrise Crew', preview: 'Sienna: Coffee after the walk?', time: '18m ago', initial: 'SC', group: true, baseMessages: [{ direction: 'incoming', body: 'Coffee after the walk?' }, { direction: 'outgoing', body: 'Count me in.' }] },
  { id: 'group-cleanup', name: 'Trail Cleanup Team', preview: 'Elena: Gloves are packed.', time: '3h ago', initial: 'TC', group: true, baseMessages: [{ direction: 'incoming', body: 'Gloves and collection bags are packed.' }] },
];

const liveConversation: Conversation = {
  id: 'live-walk',
  name: 'Morning Harbor Loop',
  preview: 'Just passing the 2 km mark...',
  time: 'Now',
  initial: 'MH',
  group: true,
  online: true,
  baseMessages: [{ direction: 'incoming', body: 'Just passing the 2 km mark. The group is staying together.' }],
};

export function MessagesClient() {
  const [tab, setTab] = useState<'CHATS' | 'GROUPS'>('CHATS');
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState('');
  const { state, addMessage } = usePreviewState();
  const { mode } = useAppSession();
  const { notify } = useInteractions();
  const visible = tab === 'CHATS' ? chats : groups;
  const allConversations = useMemo(() => [liveConversation, ...chats, ...groups], []);
  const selected = selectedId ? allConversations.find(item => item.id === selectedId) ?? null : null;

  useEffect(() => {
    if (window.matchMedia('(min-width: 900px)').matches) setSelectedId('sienna');
  }, []);

  function send(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !selected) return;
    addMessage(selected.id, body);
    setDraft('');
    notify('Message saved in this device-only messaging preview.');
  }

  function choose(conversation: Conversation) {
    setSelectedId(conversation.id);
    setDraft('');
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  }

  return <section className={`messages-page messaging-layout ${selected ? 'has-conversation' : ''}`}>
    <div className="messages-product-note" role="status"><UiIcon name="chat" size={18} /><span><strong>Messaging preview</strong><small>{mode === 'CONNECTED' ? 'These sample conversations do not send messages to other accounts yet.' : 'Sample chats and your replies are stored only on this device.'}</small></span></div>
    <aside className="conversations-pane" aria-label="Conversations">
      <div className="messages-tabs" role="tablist" aria-label="Message categories">
        <button id="chats-tab" role="tab" aria-controls="conversation-list" aria-selected={tab === 'CHATS'} onClick={() => setTab('CHATS')}>Chats</button>
        <button id="groups-tab" role="tab" aria-controls="conversation-list" aria-selected={tab === 'GROUPS'} onClick={() => setTab('GROUPS')}>Groups</button>
      </div>
      <button className="live-chat-card" onClick={() => choose(liveConversation)}>
        <div><span className="live-dot" /> LIVE WALK SESSION <b>Now</b></div>
        <h1>Morning Harbor Loop<br />Chat</h1>
        <p><span className="chat-faces">S E J</span><strong>+12</strong><span>Just passing the 2 km mark...</span></p>
      </button>
      <h2 className="messages-label">{tab === 'CHATS' ? 'Recent Messages' : 'Your Groups'}</h2>
      <div id="conversation-list" role="tabpanel" aria-labelledby={tab === 'CHATS' ? 'chats-tab' : 'groups-tab'} className="message-list">
        {visible.map(chat => <button className={`message-row ${selected?.id === chat.id ? 'selected' : ''}`} key={chat.id} onClick={() => choose(chat)}>
          <span className={`avatar message-avatar ${chat.online ? 'online' : ''}`}>{chat.initial}</span>
          <span><strong>{chat.name}</strong><small>{(state.messages[chat.id]?.at(-1)?.body) ?? chat.preview}</small></span>
          <time>{state.messages[chat.id]?.length ? 'Now' : chat.time}</time>{chat.online && <i />}
        </button>)}
      </div>
    </aside>

    <section className="conversation-pane conversation-page" aria-label={selected ? `Conversation with ${selected.name}` : 'Select a conversation'}>
      {selected ? <>
        <header className="conversation-header"><button className="mobile-conversation-back" onClick={() => setSelectedId('')} aria-label="Back to conversations">Back</button><span className="avatar small">{selected.initial}</span><span><strong>{selected.name}</strong><small>{selected.online ? 'Active now' : selected.group ? 'Group conversation' : 'Flinkout message'}</small></span></header>
        <div className="conversation-thread" aria-live="polite">
          <time>Today</time>
          {selected.baseMessages.map((message, index) => <p className={`message-bubble ${message.direction}`} key={`${selected.id}-base-${index}`}>{message.body}</p>)}
          {(state.messages[selected.id] ?? []).map(message => <p className="message-bubble outgoing" key={message.id}>{message.body}<small>Sent</small></p>)}
        </div>
        <form className="message-composer" onSubmit={send}><label className="sr-only" htmlFor="message-draft">Preview a message to {selected.name}</label><input id="message-draft" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Write a preview reply…" autoComplete="off" /><button disabled={!draft.trim()}>Save reply</button></form>
      </> : <div className="empty-state"><h2>Select a conversation</h2><p>Your chats and group activity will appear here.</p></div>}
    </section>
  </section>;
}
