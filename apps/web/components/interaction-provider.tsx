'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type ShareInput = { title: string; text?: string; url?: string };
type InteractionContextValue = {
  notify: (message: string) => void;
  share: (input: ShareInput) => Promise<void>;
};

export type PreviewMessage = { id: string; body: string; createdAt: string };
export type PreviewComment = { id: string; body: string; createdAt: string };
type PreviewState = {
  reactedActivityIds: string[];
  savedActivityIds: string[];
  hiddenActivityIds: string[];
  followingUsernames: string[];
  joinedSessionIds: string[];
  joinedClubIds: string[];
  notificationsRead: boolean;
  messages: Record<string, PreviewMessage[]>;
  comments: Record<string, PreviewComment[]>;
  recentSearches: string[];
};
type PreviewContextValue = {
  state: PreviewState;
  hydrated: boolean;
  toggleReaction: (id: string) => void;
  toggleSaved: (id: string) => void;
  toggleHidden: (id: string) => void;
  toggleFollow: (username: string) => void;
  toggleSession: (id: string) => void;
  toggleClub: (id: string) => void;
  markNotificationsRead: () => void;
  addMessage: (conversationId: string, body: string) => void;
  addComment: (activityId: string, body: string) => void;
  deleteComment: (activityId: string, commentId: string) => void;
  setRecentSearches: (items: string[]) => void;
  resetPreview: () => void;
};

const InteractionContext = createContext<InteractionContextValue | null>(null);
const PreviewContext = createContext<PreviewContextValue | null>(null);
const PREVIEW_KEY = 'flinkout-preview-state-v2';
const initialPreviewState: PreviewState = {
  reactedActivityIds: ['demo-walk'],
  savedActivityIds: [],
  hiddenActivityIds: [],
  followingUsernames: [],
  joinedSessionIds: [],
  joinedClubIds: ['sunrise'],
  notificationsRead: false,
  messages: {},
  comments: {},
  recentSearches: ['#LakeviewPath', '@marcus_moves'],
};

export function InteractionProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState('');
  const [previewState, setPreviewState] = useState<PreviewState>(initialPreviewState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PREVIEW_KEY);
      if (saved) setPreviewState({ ...initialPreviewState, ...JSON.parse(saved) as PreviewState });
    } catch {
      // The preview remains functional in memory when storage is unavailable.
    } finally {
      setHydrated(true);
    }
  }, []);

  const updatePreview = useCallback((update: (current: PreviewState) => PreviewState) => {
    setPreviewState(current => {
      const next = update(current);
      try { window.localStorage.setItem(PREVIEW_KEY, JSON.stringify(next)); } catch { /* Keep in-memory state. */ }
      return next;
    });
  }, []);

  const toggleListValue = useCallback((key: keyof Pick<PreviewState, 'reactedActivityIds' | 'savedActivityIds' | 'hiddenActivityIds' | 'followingUsernames' | 'joinedSessionIds' | 'joinedClubIds'>, value: string) => {
    updatePreview(current => {
      const values = current[key];
      return { ...current, [key]: values.includes(value) ? values.filter(item => item !== value) : [...values, value] };
    });
  }, [updatePreview]);

  const notify = useCallback((next: string) => {
    setMessage(next);
    window.setTimeout(() => setMessage(current => current === next ? '' : current), 3200);
  }, []);

  const share = useCallback(async ({ title, text, url }: ShareInput) => {
    const target = url ?? window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url: target });
        notify('Shared successfully.');
        return;
      }
      await navigator.clipboard.writeText(target);
      notify('Link copied to your clipboard.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      notify('The link is ready to copy from the address bar.');
    }
  }, [notify]);

  const value = useMemo(() => ({ notify, share }), [notify, share]);
  const previewValue = useMemo<PreviewContextValue>(() => ({
    state: previewState,
    hydrated,
    toggleReaction: id => toggleListValue('reactedActivityIds', id),
    toggleSaved: id => toggleListValue('savedActivityIds', id),
    toggleHidden: id => toggleListValue('hiddenActivityIds', id),
    toggleFollow: username => toggleListValue('followingUsernames', username),
    toggleSession: id => toggleListValue('joinedSessionIds', id),
    toggleClub: id => toggleListValue('joinedClubIds', id),
    markNotificationsRead: () => updatePreview(current => ({ ...current, notificationsRead: true })),
    addMessage: (conversationId, body) => updatePreview(current => ({
      ...current,
      messages: {
        ...current.messages,
        [conversationId]: [...(current.messages[conversationId] ?? []), { id: crypto.randomUUID(), body, createdAt: new Date().toISOString() }],
      },
    })),
    addComment: (activityId, body) => updatePreview(current => ({
      ...current,
      comments: {
        ...current.comments,
        [activityId]: [{ id: crypto.randomUUID(), body, createdAt: new Date().toISOString() }, ...(current.comments[activityId] ?? [])],
      },
    })),
    deleteComment: (activityId, commentId) => updatePreview(current => ({
      ...current,
      comments: {
        ...current.comments,
        [activityId]: (current.comments[activityId] ?? []).filter(comment => comment.id !== commentId),
      },
    })),
    setRecentSearches: recentSearches => updatePreview(current => ({ ...current, recentSearches })),
    resetPreview: () => {
      try { window.localStorage.removeItem(PREVIEW_KEY); } catch { /* Ignore storage errors. */ }
      setPreviewState(initialPreviewState);
    },
  }), [hydrated, previewState, toggleListValue, updatePreview]);
  return <InteractionContext.Provider value={value}>
    <PreviewContext.Provider value={previewValue}>
      {children}
      <div className={`app-toast ${message ? 'visible' : ''}`} role="status" aria-live="polite">{message}</div>
    </PreviewContext.Provider>
  </InteractionContext.Provider>;
}

export function useInteractions() {
  const value = useContext(InteractionContext);
  if (!value) throw new Error('useInteractions must be used inside InteractionProvider');
  return value;
}

export function usePreviewState() {
  const value = useContext(PreviewContext);
  if (!value) throw new Error('usePreviewState must be used inside InteractionProvider');
  return value;
}
