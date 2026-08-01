'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppSession, usePreviewState } from './interaction-provider';
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
  preview: 'Just passing the 2 km mark…',
  time: 'Now',
  initial: 'MH',
  group: true,
  online: true,
  baseMessages: [{ direction: 'incoming', body: 'Just passing the 2 km mark. The group is staying together.' }],
};

function MessengerExperience({ variant, onClose }: { variant: 'page' | 'popup'; onClose?: () => void }) {
  const [tab, setTab] = useState<'CHATS' | 'GROUPS'>('CHATS');
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { state, addMessage, markMessageDelivered } = usePreviewState();
  const { mode } = useAppSession();
  const allConversations = useMemo(() => [liveConversation, ...chats, ...groups], []);
  const selected = selectedId ? allConversations.find(item => item.id === selectedId) ?? null : null;
  const source = tab === 'CHATS' ? chats : groups;
  const visible = source.filter(item => item.name.toLowerCase().includes(search.trim().toLowerCase()));
  const messageCount = selected ? (state.messages[selected.id]?.length ?? 0) : 0;

  useEffect(() => {
    if (variant === 'page' && window.matchMedia('(min-width: 900px)').matches) setSelectedId('sienna');
  }, [variant]);

  useEffect(() => {
    if (!selected) return;
    window.requestAnimationFrame(() => threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: messageCount ? 'smooth' : 'auto' }));
  }, [messageCount, selected]);

  function send(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !selected) return;
    const messageId = addMessage(selected.id, body);
    setDraft('');
    window.setTimeout(() => markMessageDelivered(selected.id, messageId), 650);
    inputRef.current?.focus();
  }

  function choose(conversation: Conversation) {
    setSelectedId(conversation.id);
    setDraft('');
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function changeTab(next: 'CHATS' | 'GROUPS') {
    setTab(next);
    setSelectedId('');
    setSearch('');
  }

  function compose() {
    setTab('CHATS');
    setSelectedId('');
    setSearch('');
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }

  return <section className={`messages-page messaging-layout ${variant === 'page' ? 'messenger-page' : 'messenger-popup-surface'} ${selected ? 'has-conversation' : ''}`}>
    {variant === 'popup' && <header className="messenger-window-header">
      <div><span className="messenger-logo"><UiIcon name="chat" size={20} /></span><span><strong>Messages</strong><small>{mode === 'CONNECTED' ? 'Flinkout Messenger' : 'Device preview'}</small></span></div>
      <button onClick={onClose} aria-label="Close messages"><UiIcon name="close" size={20} /></button>
    </header>}

    {variant === 'page' && <div className="messages-product-note" role="status"><UiIcon name="chat" size={18} /><span><strong>Messaging preview</strong><small>{mode === 'CONNECTED' ? 'These sample conversations do not send messages to other accounts yet.' : 'Sample chats and your replies are stored only on this device.'}</small></span></div>}

    <aside className="conversations-pane" aria-label="Conversations">
      <div className="messenger-list-heading"><div><strong>Chats</strong><span>{tab === 'CHATS' ? chats.length : groups.length}</span></div><button onClick={compose} aria-label="Compose a new message"><UiIcon name="edit" size={18} /></button></div>
      <label className="messenger-search"><UiIcon name="search" size={17} /><span className="sr-only">Search messages</span><input ref={searchRef} value={search} onChange={event => setSearch(event.target.value)} placeholder="Search messages" /></label>
      <div className="messages-tabs" role="tablist" aria-label="Message categories">
        <button id={`${variant}-chats-tab`} role="tab" aria-controls={`${variant}-conversation-list`} aria-selected={tab === 'CHATS'} onClick={() => changeTab('CHATS')}>Chats</button>
        <button id={`${variant}-groups-tab`} role="tab" aria-controls={`${variant}-conversation-list`} aria-selected={tab === 'GROUPS'} onClick={() => changeTab('GROUPS')}>Groups</button>
      </div>
      <button className="live-chat-card" onClick={() => choose(liveConversation)}>
        <div><span className="live-dot" /> LIVE WALK SESSION <b>Now</b></div>
        <h1>Morning Harbor Loop <span>Chat</span></h1>
        <p><span className="chat-faces">S E J</span><strong>+12</strong><span>Just passing the 2 km mark…</span></p>
      </button>
      <h2 className="messages-label">{tab === 'CHATS' ? 'Recent messages' : 'Your groups'}</h2>
      <div id={`${variant}-conversation-list`} role="tabpanel" aria-labelledby={tab === 'CHATS' ? `${variant}-chats-tab` : `${variant}-groups-tab`} className="message-list">
        {visible.map(chat => <button className={`message-row ${selected?.id === chat.id ? 'selected' : ''}`} aria-pressed={selected?.id === chat.id} key={chat.id} onClick={() => choose(chat)}>
          <span className={`avatar message-avatar ${chat.online ? 'online' : ''}`}>{chat.initial}</span>
          <span><strong>{chat.name}</strong><small>{state.messages[chat.id]?.at(-1)?.body ?? chat.preview}</small></span>
          <time>{state.messages[chat.id]?.length ? 'Now' : chat.time}</time>{chat.online && <i />}
        </button>)}
        {!visible.length && <div className="message-list-empty"><UiIcon name="search" /><strong>No conversations found</strong><small>Try another name.</small></div>}
      </div>
    </aside>

    <section className="conversation-pane conversation-page" aria-label={selected ? `Conversation with ${selected.name}` : 'Select a conversation'}>
      {selected ? <>
        <header className="conversation-header"><button className="mobile-conversation-back" onClick={() => setSelectedId('')} aria-label="Back to conversations"><UiIcon name="back" size={19} /></button><span className={`avatar small ${selected.online ? 'online' : ''}`}>{selected.initial}</span><span><strong>{selected.name}</strong><small>{selected.online ? 'Active now' : selected.group ? 'Group conversation' : 'Flinkout message'}</small></span></header>
        <div className="conversation-thread" ref={threadRef} aria-live="polite">
          <time>Today</time>
          {selected.baseMessages.map((message, index) => <p className={`message-bubble ${message.direction}`} key={`${selected.id}-base-${index}`}>{message.body}</p>)}
          {(state.messages[selected.id] ?? []).map(message => <p className="message-bubble outgoing" key={message.id}>{message.body}<small>{message.status === 'SENDING' ? 'Sending…' : 'Delivered'} <span aria-hidden="true">✓</span></small></p>)}
        </div>
        <form className="message-composer" onSubmit={send}><label className="sr-only" htmlFor={`${variant}-message-draft`}>Message {selected.name}</label><input ref={inputRef} id={`${variant}-message-draft`} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Aa" autoComplete="off" enterKeyHint="send" /><button disabled={!draft.trim()} aria-label={`Send message to ${selected.name}`}><UiIcon name="send" size={19} /></button></form>
      </> : <div className="empty-state"><span className="messenger-empty-icon"><UiIcon name="chat" size={28} /></span><h2>Your messages</h2><p>Select a chat or group to start talking.</p></div>}
    </section>
  </section>;
}

export function MessagesClient() {
  return <MessengerExperience variant="page" />;
}

export function MessengerPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <div className="messenger-popup" role="dialog" aria-label="Messages"><MessengerExperience variant="popup" onClose={onClose} /></div>;
}
