import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

export type PushState =
  | 'unsupported'
  | 'needs-install' // iOS Safari outside the installed PWA
  | 'denied'
  | 'off'
  | 'on'
  | 'loading';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function usePush() {
  const [state, setState] = useState<PushState>('loading');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState(isIos() && !isStandalone() ? 'needs-install' : 'unsupported');
      return;
    }
    if (isIos() && !isStandalone()) {
      setState('needs-install');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setState(subscription ? 'on' : 'off');
    } catch {
      setState('off');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    setError(null);
    setState('loading');
    try {
      // Permission first — iOS requires the prompt inside the user gesture,
      // before any await on the network.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const { publicKey } = await api<{ publicKey: string | null }>('/api/push/vapid-public-key');
      if (!publicKey) throw new Error('השרת לא מוגדר לשליחת התראות');
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const json = subscription.toJSON();
      await api('/api/push/subscribe', {
        method: 'POST',
        body: { endpoint: subscription.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } },
      });
      setState('on');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ההרשמה להתראות נכשלה');
      setState('off');
    }
  }, []);

  const disable = useCallback(async () => {
    setError(null);
    setState('loading');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await api('/api/push/subscribe', {
          method: 'DELETE',
          body: { endpoint: subscription.endpoint },
        });
        await subscription.unsubscribe();
      }
      setState('off');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ביטול ההתראות נכשל');
      void refresh();
    }
  }, [refresh]);

  return { state, error, enable, disable };
}
