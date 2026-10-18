// BookingActivity.ios.tsx — the group booking's Live Activity: the Lock
// Screen card and the Dynamic Island. "Kingpin Lanes · 3 of 4 paid · closes
// in 42m" while shares come in. Once everyone's paid the card ends (ended
// cards stay on the Lock Screen only) with "Show code … at the door".
//
// The layout function is a 'widget' function: Babel turns it into a string
// that runs inside the widget extension, so it may only use its own props and
// the @expo/ui SwiftUI components/modifiers (globals there). No hooks, no
// helpers or constants from this file. The imports below are for types only
// at runtime. Countdowns are SwiftUI timers, so they tick on the device
// without any push. A timer Text claims all the width it's offered, so it's
// pinned to a trailing-aligned frame.
import { Image, HStack, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  bold, font, foregroundStyle, frame, monospacedDigit, multilineTextAlignment, padding, progressViewStyle, tint,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';
import type { LiveActivityProps } from './api';

// Must match ACTIVITY_NAME in backend/live_activity.py.
export const BookingActivity = createLiveActivity<LiveActivityProps>('booking', (props) => {
  'widget';
  const RED = '#E8202C';
  const secondary = { type: 'hierarchical', style: 'secondary' } as const;
  const now = new Date();
  const deadline = props.deadlineAt > now.getTime() ? new Date(props.deadlineAt) : null;
  const ended = props.phase === 'ended';
  const count = `${props.paid}/${props.total}`;
  const share = `$${(props.myShareCents / 100).toFixed(2)}`;

  const countdown = (until: Date | null, label: string) =>
    until ? (
      <VStack alignment="trailing" spacing={0}>
        <Text modifiers={[font({ size: 11, weight: 'medium' }), foregroundStyle(secondary)]}>{label}</Text>
        <Text
          timerInterval={{ lower: now, upper: until }}
          countsDown
          modifiers={[
            font({ size: 17, weight: 'semibold' }), monospacedDigit(),
            multilineTextAlignment('trailing'), frame({ maxWidth: 96, alignment: 'trailing' }),
          ]}
        />
      </VStack>
    ) : null;

  const title = (
    <VStack alignment="leading" spacing={1}>
      <Text modifiers={[font({ textStyle: 'headline' })]}>{props.venue}</Text>
      {props.slot ? (
        <Text modifiers={[font({ textStyle: 'subheadline' }), foregroundStyle(secondary)]}>{props.slot}</Text>
      ) : null}
    </VStack>
  );

  const progress = (
    <ProgressView
      value={props.total ? props.paid / props.total : 0}
      modifiers={[progressViewStyle('linear'), tint(RED)]}
    />
  );

  const paidLine = (
    <HStack>
      <Text modifiers={[font({ size: 13, weight: 'medium' })]}>{`${props.paid} of ${props.total} paid`}</Text>
      <Spacer />
      <Text modifiers={[font({ size: 13 }), foregroundStyle(props.iPaid ? secondary : RED)]}>
        {props.iPaid ? "You're in" : `Your share ${share}`}
      </Text>
    </HStack>
  );

  if (ended) {
    return {
      banner: (
        <HStack modifiers={[padding({ all: 16 })]}>
          <VStack alignment="leading" spacing={4}>
            {title}
            <Text modifiers={[font({ size: 13 }), foregroundStyle(secondary)]}>{props.note}</Text>
          </VStack>
          <Spacer />
        </HStack>
      ),
      compactLeading: <Image systemName="checkmark.circle.fill" color={RED} />,
      compactTrailing: <Text> </Text>,
      minimal: <Image systemName="checkmark.circle.fill" color={RED} />,
      expandedLeading: title,
      expandedBottom: <Text modifiers={[font({ size: 13 }), foregroundStyle(secondary)]}>{props.note}</Text>,
    };
  }

  return {
    banner: (
      <VStack alignment="leading" spacing={10} modifiers={[padding({ all: 16 })]}>
        <HStack alignment="top">
          {title}
          <Spacer />
          {countdown(deadline, 'Closes in')}
        </HStack>
        {progress}
        {paidLine}
      </VStack>
    ),
    compactLeading: <Image systemName="person.3.fill" color={RED} />,
    compactTrailing: <Text modifiers={[font({ size: 14, weight: 'semibold' }), monospacedDigit()]}>{count}</Text>,
    minimal: <Text modifiers={[font({ size: 12, weight: 'semibold' }), monospacedDigit(), bold()]}>{count}</Text>,
    expandedLeading: <VStack alignment="leading" modifiers={[padding({ leading: 4 })]}>{title}</VStack>,
    expandedTrailing: countdown(deadline, 'Closes in'),
    expandedBottom: (
      <VStack spacing={6} modifiers={[padding({ horizontal: 4 })]}>
        {progress}
        {paidLine}
      </VStack>
    ),
  };
});
