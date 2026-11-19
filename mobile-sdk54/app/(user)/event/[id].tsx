import { useLocalSearchParams, useRouter } from 'expo-router';
import { DealDetail } from '../../../src/DealDetail';
import { setSelectedDeal, useLayoutModeChange } from '../../../src/layout';

/**
 * A drop, full screen. The body lives in src/DealDetail so the split layout
 * (open iPhone Duo, iPad) can show the same view in its detail pane.
 *
 * If the window becomes wide while this is open (the user unfolds their iPhone
 * Duo), hand the drop to the split layout and step back to the list: the list
 * then shows it in its detail pane, so the user keeps their place.
 */
export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  useLayoutModeChange((mode) => {
    if (mode === 'split' && id && router.canGoBack()) {
      setSelectedDeal(id);
      router.back();
    }
  });

  return <DealDetail id={id} />;
}
