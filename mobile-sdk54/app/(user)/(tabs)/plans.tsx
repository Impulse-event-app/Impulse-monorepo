import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { fontMono, fontUI, useApp } from '../../../src/theme';
import {
  Btn,
  CodeDisplay,
  EmptyState,
  Label,
  LargeTitle,
  NavBar,
  ReadableColumn,
  Touchable,
  useNavTop,
  useScrolled,
} from '../../../src/components';
import { Check, ChevronRight } from '../../../src/icons';
import type { Plan } from '../../../src/data';
import { FLOATING_TAB_CLEARANCE } from './_layout';

const STATUS_LABEL: Record<Plan['status'], string> = {
  attended: 'Verified',
  cancelled: 'Cancelled',
  confirmed: 'Booked',
  pending: 'Booked',
};

function StatusTag({ status }: { status: Plan['status'] }) {
  const { T } = useApp();
  if (status === 'attended') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Check size={11} color={T.accent} />
        <Text style={{ ...fontUI(500), fontSize: 13, color: T.accent }}>{STATUS_LABEL.attended}</Text>
      </View>
    );
  }
  return <Text style={{ ...fontUI(500), fontSize: 13, color: T.muted }}>{STATUS_LABEL[status]}</Text>;
}

/** One spoken summary per plan card, with the door code read digit by digit. */
function planA11yLabel(p: Plan): string {
  const people = `${p.party} ${p.party === 1 ? 'person' : 'people'}`;
  const code = p.status !== 'cancelled' && p.code ? `door code ${p.code.split('').join(' ')}` : null;
  return [p.venue, p.time || null, people, STATUS_LABEL[p.status], code].filter(Boolean).join(', ');
}

export default function PlansScreen() {
  const { T, plans, bookingsLoading, refreshBookings, signedIn } = useApp();
  const router = useRouter();
  const navTop = useNavTop();
  const [scrolled, onScroll] = useScrolled();

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ flexGrow: 1, paddingTop: navTop, paddingBottom: 24 + FLOATING_TAB_CLEARANCE }}
        refreshControl={
          signedIn ? (
            <RefreshControl refreshing={bookingsLoading} onRefresh={refreshBookings} tintColor={T.accent} progressViewOffset={navTop} />
          ) : undefined
        }
      >
        <ReadableColumn style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 16 }}>
            <LargeTitle>Plans</LargeTitle>
          </View>

          {!signedIn ? (
            <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60 }}>
              <EmptyState
                title="Your plans live here."
                body="Sign in to book. Door codes show up here, ready at the door."
                action={
                  <Btn onPress={() => router.push({ pathname: '/(user)/sign-in', params: { next: '/plans', back: '1' } })}>
                    Sign in
                  </Btn>
                }
              />
            </View>
          ) : plans.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60 }}>
              <EmptyState
                title="No plans yet."
                body="Bookings appear here with the door code."
                action={<Btn onPress={() => router.navigate('/(user)/home')}>See what's on</Btn>}
              />
            </View>
          ) : (
            <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 12 }}>
              {plans.map((p) => (
                <Touchable
                  key={p.bookingId ?? p.code}
                  scale={0.99}
                  accessibilityLabel={planA11yLabel(p)}
                  accessibilityHint="Opens the booking."
                  onPress={() => router.push(`/(user)/confirm?code=${encodeURIComponent(p.code)}`)}
                >
                  <View style={{ backgroundColor: T.surface, borderRadius: 10, borderWidth: 1, borderColor: T.line, padding: 16, gap: 14, opacity: p.status === 'cancelled' ? 0.6 : 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={2} style={{ ...fontUI(600), fontSize: 17, letterSpacing: -0.26, color: T.text }}>
                          {p.venue}
                        </Text>
                        <Text numberOfLines={2} style={{ ...fontMono(400, 13), fontSize: 13, color: T.muted, marginTop: 4 }}>
                          {[p.time, `${p.party} ${p.party === 1 ? 'person' : 'people'}`].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <StatusTag status={p.status} />
                      <ChevronRight size={8} color={T.faint} />
                    </View>
                    {p.status !== 'cancelled' && !!p.code && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 14, borderTopWidth: 1, borderTopColor: T.line }}>
                        <Label>Door code</Label>
                        <CodeDisplay code={p.code} size="sm" />
                      </View>
                    )}
                    {p.status === 'attended' && !!p.paymentNote && (
                      <Label style={{ lineHeight: 18 }}>{p.paymentNote}</Label>
                    )}
                  </View>
                </Touchable>
              ))}
            </View>
          )}
        </ReadableColumn>
      </ScrollView>
      <NavBar title="Plans" scrolled={scrolled} />
    </View>
  );
}
