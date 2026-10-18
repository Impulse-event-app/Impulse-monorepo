// liveActivity.ios.ts — keeps the group booking's Live Activity in step
// with the booking view. The backend decides who gets a card (only the
// person who booked; invitees get time-sensitive pushes with what they owe)
// and what it shows (view.live_activity); this file starts it, updates it while the app
// is open, ends it, and hands each activity's APNs token to the backend,
// which pushes every change from then on. liveActivity.ts is the no-op for
// Android and web.
//
// ActivityKit only gives JS an activity's id, not its props, so which booking
// an activity belongs to is kept in persist ({ bookingId: activityId }). An
// empty id means the user swiped that booking's card away: it stays gone.
import * as Linking from 'expo-linking';
import { after, type LiveActivity } from 'expo-widgets';
import { BookingActivity } from './BookingActivity.ios';
import { registerLiveActivity, unregisterLiveActivity, type ApiBookingView, type LiveActivityProps } from './api';
import { persistGet, persistSet } from './persist';

const KEY = 'live_activities';
// How long the final "Everyone's paid" card stays on the Lock Screen
// (matches DISMISS_AFTER in backend/live_activity.py).
const DISMISS_AFTER_MS = 15 * 60_000;

type Activity = LiveActivity<LiveActivityProps>;

let owners: Record<string, string> | null = null;   // bookingId → activityId ('' = dismissed)
const watched = new Set<string>();                    // activity ids sending their token
let queue: Promise<void> = Promise.resolve();

function running(): Map<string, Activity> {
  return new Map(BookingActivity.getInstances().map((a) => [a.getId(), a]));
}

async function load(): Promise<Record<string, string>> {
  if (!owners) {
    try {
      owners = JSON.parse((await persistGet(KEY)) ?? '{}') as Record<string, string>;
    } catch {
      owners = {};
    }
  }
  return owners;
}

function save() {
  persistSet(KEY, JSON.stringify(owners ?? {}));
}

/** Send the activity's push token now and whenever iOS rotates it. */
function watchToken(bookingId: string, activity: Activity) {
  const id = activity.getId();
  if (watched.has(id)) return;
  watched.add(id);
  const send = (token: string | null) => {
    if (token) registerLiveActivity(bookingId, token).catch(() => {});
  };
  activity.getPushToken().then(send, () => {});
  activity.addPushTokenListener((e) => send(e.pushToken));
}

async function end(bookingId: string, activity: Activity | undefined, final?: LiveActivityProps) {
  const map = await load();
  if (activity) {
    const policy = final ? after(new Date(Date.now() + DISMISS_AFTER_MS)) : 'immediate';
    await activity.end(policy, final).catch(() => {});
  }
  if (bookingId in map) {
    if (map[bookingId]) unregisterLiveActivity(bookingId).catch(() => {});
    delete map[bookingId];
    save();
  }
}

/** The card is gone but the booking isn't over — the user dismissed it. */
function dismissed(map: Record<string, string>, bookingId: string) {
  if (!map[bookingId]) return;
  map[bookingId] = '';
  save();
  unregisterLiveActivity(bookingId).catch(() => {});
}

async function sync(view: ApiBookingView) {
  if (view.live_activity === undefined) return;     // backend predates Live Activities
  const map = await load();
  const activity = map[view.id] ? running().get(map[view.id]) : undefined;
  const props = view.live_activity;
  if (!props || props.phase === 'ended') {
    await end(view.id, activity, props ?? undefined);
    return;
  }
  if (activity) {
    await activity.update(props);
    watchToken(view.id, activity);
    return;
  }
  if (view.id in map) {
    dismissed(map, view.id);
    return;
  }
  const url = Linking.createURL(view.has_voting ? `/huddle/${view.id}` : `/split/${view.id}`);
  // Throws when the user has turned Live Activities off for the app.
  const started = BookingActivity.start(props, url);
  map[view.id] = started.getId();
  save();
  watchToken(view.id, started);
}

/** Start, update or end my card for this booking. Calls run one at a time,
 *  so two quick refetches can't start two cards. */
export function syncBookingActivity(view: ApiBookingView): void {
  queue = queue.then(() => sync(view)).catch(() => {});
}

/** On foreground: end cards whose booking is no longer collecting (paid
 *  up or finished while the app was closed), and any card we've lost track of. */
export function reconcileBookingActivities(activeBookingIds: string[]): void {
  queue = queue.then(async () => {
    const map = await load();
    const live = running();
    const active = new Set(activeBookingIds);
    const owned = new Set<string>();
    for (const [bookingId, activityId] of Object.entries(map)) {
      if (!active.has(bookingId)) await end(bookingId, live.get(activityId));
      else if (live.has(activityId)) owned.add(activityId);
      else dismissed(map, bookingId);
    }
    for (const [id, a] of live) {
      if (!owned.has(id)) await a.end('immediate').catch(() => {});
    }
  }).catch(() => {});
}
