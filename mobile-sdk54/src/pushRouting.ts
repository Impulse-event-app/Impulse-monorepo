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
import { declineSeat } from './api';

const SEAT_INVITE = 'seat_invite';
const PAY = 'pay';
const DECLINE = 'decline';

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
        // Without a handler iOS drops pushes that arrive while the app is
        // open — show them as a banner like any other.
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });
        // Seat invites expand into Pay now / Can't make it (the server sets
        // categoryId "seat_invite"). Pay now opens the split screen, where the
        // pay button is; declining happens in the background.
        Notifications.setNotificationCategoryAsync(SEAT_INVITE, [
          { identifier: PAY, buttonTitle: 'Pay now', options: { opensAppToForeground: true } },
          { identifier: DECLINE, buttonTitle: "Can't make it", options: { opensAppToForeground: false, isDestructive: true } },
        ]).catch(() => {});
        const handle = (response: { actionIdentifier: string; notification: { request: { content: { data: unknown } } } }) => {
          const data = response.notification.request.content.data as PushData;
          if (response.actionIdentifier === DECLINE) {
            if (typeof data?.bookingId === 'string') declineSeat(data.bookingId).catch(() => {});
            return;
          }
          const href = pushHref(data);
          if (href) router.push(href as never);
        };
        // Cold start: the tap that launched the app. Consume it so a later
        // re-mount doesn't navigate again.
        const last = Notifications.getLastNotificationResponse();
        if (last) {
          handle(last);
          Notifications.clearLastNotificationResponse();
        }
        sub = Notifications.addNotificationResponseReceivedListener(handle);
      })
      .catch(() => { /* notifications unavailable (e.g. Expo Go limitation) */ });

    return () => { alive = false; sub?.remove(); };
  }, [router]);
}
