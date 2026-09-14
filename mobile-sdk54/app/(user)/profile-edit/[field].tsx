// Profile field editors — each a sheet over the You tab (a native formSheet on
// iOS: grabber, detents, swipe down to cancel). Drafts are local, so
// dismissing without saving simply discards them.
import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { CATEGORIES } from '../../../src/data';
import { useApp, type Appearance } from '../../../src/theme';
import { Btn, Chip, Group, Label, NATIVE_SHEETS, Row, SheetFrame, Stepper } from '../../../src/components';
import { Check } from '../../../src/icons';
import { syncUserProfile } from '../../../src/auth';
import { useWallet, WalletPanel } from '../../../src/wallet';
import { hapticSelection } from '../../../src/haptics';

const SUBURBS = ['Sydney CBD', 'Surry Hills', 'Newtown', 'Bondi', 'Marrickville', 'Enmore', 'Darlinghurst', 'Redfern', 'Chippendale', 'Glebe', 'Paddington', 'Manly', 'Strathfield'];
const ACTIVITIES = CATEGORIES.filter((c) => c !== 'All');
const APPEARANCES: { id: Appearance; label: string; sublabel?: string }[] = [
  { id: 'system', label: 'System', sublabel: 'Match this device' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

type EditorProps = { close: () => void };

function SuburbEditor({ close }: EditorProps) {
  const { profile, setProfile } = useApp();
  const [draft, setDraft] = useState(profile.suburb);
  const options = draft && !SUBURBS.includes(draft) ? [draft, ...SUBURBS] : SUBURBS;
  const save = () => {
    setProfile((p) => ({ ...p, suburb: draft }));
    syncUserProfile({ suburb: draft }).catch(console.warn);
    close();
  };
  return (
    <SheetFrame
      native={NATIVE_SHEETS}
      onClose={close}
      title="Home suburb"
      subtitle="We sort by what's closest."
      footer={<Btn full onPress={save} disabled={!draft}>{draft ? `Set to ${draft}` : 'Pick your suburb'}</Btn>}
      bodyStyle={{ paddingHorizontal: 16 }}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 10 }}>
        {options.map((s) => (
          <Chip key={s} active={draft === s} onPress={() => setDraft(s)}>{s}</Chip>
        ))}
      </View>
    </SheetFrame>
  );
}

function FavouritesEditor({ close }: EditorProps) {
  const { profile, setProfile } = useApp();
  const [draft, setDraft] = useState<string[]>(profile.acts || []);
  const toggle = (a: string) => setDraft((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]));
  const save = () => {
    setProfile((p) => ({ ...p, acts: draft }));
    syncUserProfile({ acts: draft }).catch(console.warn);
    close();
  };
  return (
    <SheetFrame
      native={NATIVE_SHEETS}
      onClose={close}
      title="Favourites"
      subtitle="These go first in your feed."
      footer={<Btn full onPress={save}>{draft.length ? `Save · ${draft.length} picked` : 'Show me everything'}</Btn>}
      bodyStyle={{ paddingHorizontal: 16 }}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 10 }}>
        {ACTIVITIES.map((a) => (
          <Chip key={a} active={draft.includes(a)} onPress={() => toggle(a)}>{a}</Chip>
        ))}
      </View>
    </SheetFrame>
  );
}

function PartyEditor({ close }: EditorProps) {
  const { profile, setProfile } = useApp();
  const [draft, setDraft] = useState(profile.party || 2);
  const save = () => {
    setProfile((p) => ({ ...p, party: draft }));
    syncUserProfile({ party_size: draft }).catch(console.warn);
    close();
  };
  return (
    <SheetFrame
      native={NATIVE_SHEETS}
      onClose={close}
      title="Usual party size"
      subtitle="How many you usually book for."
      footer={<Btn full onPress={save}>Save</Btn>}
    >
      <View style={{ alignItems: 'center', paddingVertical: 16 }}>
        <Stepper value={draft} onChange={setDraft} max={12} label="Usual party size" />
      </View>
    </SheetFrame>
  );
}

function PaymentEditor({ close }: EditorProps) {
  const wallet = useWallet();
  return (
    <SheetFrame native={NATIVE_SHEETS} onClose={close} title="Payment" subtitle="Saved cards book in one tap." bodyStyle={{ paddingHorizontal: 16 }}>
      <WalletPanel wallet={wallet} depositLabel="Save card" />
      <Label style={{ marginTop: 14, marginHorizontal: 16, lineHeight: 18 }}>
        Cards are held by our payment provider. Impulse never sees the number.
      </Label>
    </SheetFrame>
  );
}

function AppearanceEditor({ close }: EditorProps) {
  const { T, appearance, setAppearance } = useApp();
  const pick = (a: Appearance) => {
    hapticSelection();
    setAppearance(a);
    close();
  };
  return (
    <SheetFrame native={NATIVE_SHEETS} onClose={close} title="Appearance" bodyStyle={{ paddingHorizontal: 16 }}>
      <Group style={{ marginTop: 0 }} inset={16}>
        {APPEARANCES.map((o) => {
          const on = appearance === o.id;
          return (
            <Row
              key={o.id}
              label={o.label}
              sublabel={o.sublabel}
              selected={on}
              chevron={false}
              onPress={() => pick(o.id)}
              trailing={on ? <Check size={14} color={T.accent} /> : <View style={{ width: 14 }} />}
            />
          );
        })}
      </Group>
    </SheetFrame>
  );
}

export default function ProfileEditSheet() {
  const { field } = useLocalSearchParams<{ field: string }>();
  const router = useRouter();
  const close = () => router.back();
  switch (field) {
    case 'suburb': return <SuburbEditor close={close} />;
    case 'favourites': return <FavouritesEditor close={close} />;
    case 'party': return <PartyEditor close={close} />;
    case 'payment': return <PaymentEditor close={close} />;
    default: return <AppearanceEditor close={close} />;
  }
}
