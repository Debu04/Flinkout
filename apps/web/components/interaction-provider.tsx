'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

type ShareInput = { title: string; text?: string; url?: string };
type InteractionContextValue = {
  notify: (message: string) => void;
  share: (input: ShareInput) => Promise<void>;
};

const InteractionContext = createContext<InteractionContextValue | null>(null);

export function InteractionProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState('');

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
  return <InteractionContext.Provider value={value}>
    {children}
    <div className={`app-toast ${message ? 'visible' : ''}`} role="status" aria-live="polite">{message}</div>
  </InteractionContext.Provider>;
}

export function useInteractions() {
  const value = useContext(InteractionContext);
  if (!value) throw new Error('useInteractions must be used inside InteractionProvider');
  return value;
}
