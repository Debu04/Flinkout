'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, type SocialActivity, type User } from '../lib/api';

type ShareInput = { title: string; text?: string; url?: string };
type InteractionContextValue = {
  notify: (message: string) => void;
  share: (input: ShareInput) => Promise<void>;
};

export type PreviewMessage = { id: string; body: string; createdAt: string; status?: 'SENDING' | 'DELIVERED' };
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
  postedActivities: SocialActivity[];
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
  addMessage: (conversationId: string, body: string) => string;
  markMessageDelivered: (conversationId: string, messageId: string) => void;
  addComment: (activityId: string, body: string) => void;
  deleteComment: (activityId: string, commentId: string) => void;
  setRecentSearches: (items: string[]) => void;
  postActivity: (activity: SocialActivity) => void;
  resetPreview: () => void;
};
type SessionMode = 'CHECKING' | 'CONNECTED' | 'PREVIEW';
type AppSessionContextValue = {
  viewer: User;
  mode: SessionMode;
  refreshSession: () => Promise<boolean>;
};

const InteractionContext = createContext<InteractionContextValue | null>(null);
const PreviewContext = createContext<PreviewContextValue | null>(null);
const AppSessionContext = createContext<AppSessionContextValue | null>(null);
const PREVIEW_KEY = 'flinkout-preview-state-v2';
export const previewViewer: User = {
  id: 'demo-marcus',
  username: 'marcus_moves',
  profile: {
    displayName: 'Marcus Rivera',
    bio: 'Everyday explorer, weekend trail guide, and believer that movement is better together.',
    photoUrl: null,
    profileVisibility: 'PUBLIC',
    routeVisibility: 'FOLLOWERS',
    discoverable: true,
  },
  isSelf: true,
};
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
  recentSearches: [],
  postedActivities: [],
};

export function InteractionProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState('');
  const [previewState, setPreviewState] = useState<PreviewState>(initialPreviewState);
  const [hydrated, setHydrated] = useState(false);
  const [viewer, setViewer] = useState<User>(previewViewer);
  const [mode, setMode] = useState<SessionMode>('CHECKING');

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

  const refreshSession = useCallback(async () => {
    try {
      const response = await api<{ user: User }>('/auth/me');
      setViewer(response.user);
      setMode('CONNECTED');
      return true;
    } catch {
      setViewer(previewViewer);
      setMode('PREVIEW');
      return false;
    }
  }, []);

  useEffect(() => { void refreshSession(); }, [refreshSession]);

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
  const sessionValue = useMemo<AppSessionContextValue>(() => ({ viewer, mode, refreshSession }), [mode, refreshSession, viewer]);
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
    addMessage: (conversationId, body) => {
      const id = crypto.randomUUID();
      updatePreview(current => ({
        ...current,
        messages: {
          ...current.messages,
          [conversationId]: [...(current.messages[conversationId] ?? []), { id, body, createdAt: new Date().toISOString(), status: 'SENDING' }],
        },
      }));
      return id;
    },
    markMessageDelivered: (conversationId, messageId) => updatePreview(current => ({
      ...current,
      messages: {
        ...current.messages,
        [conversationId]: (current.messages[conversationId] ?? []).map(message => message.id === messageId ? { ...message, status: 'DELIVERED' } : message),
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
    postActivity: activity => updatePreview(current => ({
      ...current,
      postedActivities: [
        activity,
        ...current.postedActivities.filter(item =>
          item.id !== activity.id
          && (!activity.clientId || item.clientId !== activity.clientId)
          && (!activity.syncedActivityId || item.id !== activity.syncedActivityId)
        ),
      ],
    })),
    resetPreview: () => {
      try { window.localStorage.removeItem(PREVIEW_KEY); } catch { /* Ignore storage errors. */ }
      setPreviewState(initialPreviewState);
    },
  }), [hydrated, previewState, toggleListValue, updatePreview]);
  return <InteractionContext.Provider value={value}>
    <AppSessionContext.Provider value={sessionValue}>
      <PreviewContext.Provider value={previewValue}>
        {children}
        <div className={`app-toast ${message ? 'visible' : ''}`} role="status" aria-live="polite">{message}</div>
      </PreviewContext.Provider>
    </AppSessionContext.Provider>
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

export function useAppSession() {
  const value = useContext(AppSessionContext);
  if (!value) throw new Error('useAppSession must be used inside InteractionProvider');
  return value;
}
