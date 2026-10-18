// liveActivity.ts — Live Activities are iOS only. Metro picks
// liveActivity.ios.ts on iOS; Android and web get these no-ops.
import type { ApiBookingView } from './api';

export function syncBookingActivity(_view: ApiBookingView): void {}

export function reconcileBookingActivities(_activeBookingIds: string[]): void {}
