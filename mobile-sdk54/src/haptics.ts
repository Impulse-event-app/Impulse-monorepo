// haptics.ts — thin, platform-safe wrappers over expo-haptics. Web has no
// haptics engine, and a failed haptic must never break the action it decorates.
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const ON = Platform.OS !== 'web';

/** A selection changed (chip, tab, vote pick, stepper). */
export function hapticSelection() {
  if (ON) Haptics.selectionAsync().catch(() => {});
}

/** A task finished successfully (booked, paid, verified). */
export function hapticSuccess() {
  if (ON) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** A task failed (payment declined, request rejected). */
export function hapticError() {
  if (ON) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}
