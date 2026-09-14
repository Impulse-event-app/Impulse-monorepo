// Area picker — a sheet opened from the location line on the feed. The user's
// home suburb first, then every suburb that currently has a drop. "All Sydney"
// clears the area filter.
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useApp } from '../../src/theme';
import { Group, NATIVE_SHEETS, Row, SheetFrame } from '../../src/components';
import { Check } from '../../src/icons';
import { hapticSelection } from '../../src/haptics';

export default function AreaSheet() {
  const { T, filters, setFilters, drops, profile } = useApp();
  const router = useRouter();

  const options = [
    ...new Set([
      ...(profile.suburb ? [profile.suburb] : []),
      ...drops.map((d) => d.suburb).filter(Boolean),
    ]),
  ];

  const pick = (s: string | null) => {
    hapticSelection();
    setFilters({ ...filters, areas: s ? [s] : [] });
    router.back();
  };

  return (
    <SheetFrame native={NATIVE_SHEETS} onClose={() => router.back()} title="Show drops in" bodyStyle={{ paddingHorizontal: 16 }}>
      <Group style={{ marginTop: 0 }} inset={16}>
        {[null, ...options].map((s) => {
          const on = s === null ? filters.areas.length === 0 : filters.areas.includes(s);
          const isHome = s !== null && s === profile.suburb;
          return (
            <Row
              key={s ?? 'all'}
              label={s ?? 'All Sydney'}
              value={isHome ? 'Home' : undefined}
              onPress={() => pick(s)}
              selected={on}
              chevron={false}
              trailing={on ? <Check size={14} color={T.accent} /> : <View style={{ width: 14 }} />}
            />
          );
        })}
      </Group>
    </SheetFrame>
  );
}
