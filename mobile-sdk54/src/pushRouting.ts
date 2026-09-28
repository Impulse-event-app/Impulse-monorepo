// pushRouting.ts — tapping a push opens the thing it's about.
//
// Every booking push carries data.bookingId (and data.huddleId for a
// Huddle), set by backend/booking_flow.push_data. Native only: expo-
// notifications has no web build, so it's imported lazily (as permissions.ts
// does). Handles both a tap that launches the app (last response, consumed
// once) and taps while it's already running.
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';

type PushData = { bookingId?: unknown; huddleId?: unknown; type?: unknown };

/** Where a booking push should land. Exported for testing/reuse. */
export function pushHref(data: PushData | undefined | null): string | null {
  if (!data) return null;
  const id = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
  const huddle = id(data.huddleId);
  if (huddle) return `/(user)/huddle/${huddle}`;
  const booking = id(data.bookingId);
  if (booking) return `/(user)/split/${booking}`;
  return null;
}

export function usePushRouting() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let sub: { remove: () => void } | null = null;
    let alive = true;

    import('expo-notifications')
      .then((Notifications) => {
        if (!alive) return;
        const open = (data: PushData | undefined) => {
          const href = pushHref(data);
          if (href) router.push(href as never);
        };
        // Cold start: the tap that launched the app. Consume it so a later
        // re-mount doesn't navigate again.
        const last = Notifications.getLastNotificationResponse();
        if (last) {
          open(last.notification.request.content.data as PushData);
          Notifications.clearLastNotificationResponse();
        }
        sub = Notifications.addNotificationResponseReceivedListener((response) => {
          open(response.notification.request.content.data as PushData);
        });
      })
      .catch(() => { /* notifications unavailable (e.g. Expo Go limitation) */ });

    return () => { alive = false; sub?.remove(); };
  }, [router]);
}
