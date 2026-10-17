import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { AppState, FlatList, Image, Pressable, Text, View, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DarkScope, fontMono, fontUI, useApp } from '../../../src/theme';
import { Btn, DiscountChip, EmptyState, Scrim, Skeleton, unitLabel, useReduceMotion } from '../../../src/components';
import { Play } from '../../../src/icons';
import { canonicalCat, money } from '../../../src/data';
import { listReels, type ApiReel } from '../../../src/api';
import { FLOATING_TAB_CLEARANCE } from './_layout';

const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

/** Is this screen the visible tab, and is the app in the foreground? Video plays only when both hold. */
function useOnScreen(): boolean {
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return focused && active;
}

function reelA11yLabel(r: ApiReel, bookable: boolean): string {
  const deal = bookable && r.deal_title ? `${r.deal_title}, ${money(r.deal_price ?? 0)}` : 'no drop live right now';
  return [r.venue_name, canonicalCat(r.venue_category), r.venue_suburb, deal].filter(Boolean).join(', ');
}

/** The player for the reel on screen (and its neighbours, so a swipe starts instantly). */
function ReelVideo({ uri, playing, width, height }: { uri: string; playing: boolean; width: number; height: number }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.audioMixingMode = 'mixWithOthers';   // never interrupt the user's music
  });
  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [playing, player]);
  // Explicit size: on web the <video> doesn't take its box from absolute insets alone.
  return <VideoView player={player} style={{ position: 'absolute', top: 0, left: 0, width, height }} contentFit="cover" nativeControls={false} allowsFullscreen={false} allowsPictureInPicture={false} />;
}

function ReelItem({ r, height, width, near, playing, paused, onTogglePause }: {
  r: ApiReel;
  height: number;
  width: number;          // the reel's own width: at most 9:16, centred on wide screens
  near: boolean;          // within one of the reel on screen: keep a player mounted
  playing: boolean;
  paused: boolean;        // the viewer paused it (or Reduce Motion and not yet started)
  onTogglePause: () => void;
}) {
  const { T, apiDeals } = useApp();
  const router = useRouter();
  const poster = r.poster_url ?? r.venue_image_url;
  // Book only when the feed still has this deal — the event page reads from the same list.
  const bookable = !!r.deal_id && !!apiDeals[r.deal_id];

  return (
    <View style={{ height, width, alignSelf: 'center', overflow: 'hidden', backgroundColor: '#000' }}>
      {poster ? <Image source={{ uri: poster }} style={[FILL, { width: '100%', height: '100%' }]} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
      {near && <ReelVideo uri={r.video_url} playing={playing} width={width} height={height} />}

      <Pressable
        onPress={onTogglePause}
        style={FILL}
        accessibilityRole="button"
        accessibilityLabel={reelA11yLabel(r, bookable)}
        accessibilityHint={paused ? 'Plays the video. Swipe up for the next venue.' : 'Pauses the video. Swipe up for the next venue.'}
      >
        {paused && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', paddingLeft: 4 }}>
              <Play size={26} color="#fff" />
            </View>
          </View>
        )}
      </Pressable>

      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <Scrim stops={[[0, 0], [0.35, 0.55], [1, 0.92]]} style={{ top: -80 }} />
        <View pointerEvents="box-none" style={{ paddingHorizontal: 16, paddingBottom: FLOATING_TAB_CLEARANCE + 8, gap: 10 }}>
          <View>
            <Text numberOfLines={2} style={{ ...fontUI(600), fontSize: 26, letterSpacing: -0.5, color: T.text }}>{r.venue_name}</Text>
            <Text numberOfLines={1} style={{ ...fontUI(500), fontSize: 14, color: T.muted, marginTop: 2 }}>
              {[canonicalCat(r.venue_category), r.venue_suburb].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {!!r.caption && (
            <Text numberOfLines={3} style={{ ...fontUI(400), fontSize: 16, lineHeight: 21, color: T.text }}>{r.caption}</Text>
          )}
          {bookable ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text numberOfLines={1} style={{ ...fontUI(500), fontSize: 14, color: T.muted }}>{r.deal_title}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 8, rowGap: 4 }}>
                  <Text style={{ ...fontMono(600), fontSize: 20, color: T.text }}>{money(r.deal_price ?? 0)}</Text>
                  <Text style={{ ...fontUI(400), fontSize: 13, color: T.muted }}>{unitLabel(r.unit ?? '')}</Text>
                  {r.original_price ? <DiscountChip now={r.deal_price ?? 0} usual={r.original_price} /> : null}
                </View>
              </View>
              <Btn small onPress={() => router.push(`/(user)/event/${r.deal_id}`)} accessibilityHint="Opens the drop to book.">
                Book
              </Btn>
            </View>
          ) : (
            <Text style={{ ...fontUI(500), fontSize: 14, color: T.muted, marginTop: 4 }}>No drop live right now</Text>
          )}
        </View>
      </View>
    </View>
  );
}

function DiscoverFeed() {
  const { T } = useApp();
  const insets = useSafeAreaInsets();
  const onScreen = useOnScreen();
  const reduceMotion = useReduceMotion();
  const [reels, setReels] = useState<ApiReel[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const height = size.height;
  const reelWidth = Math.min(size.width, Math.round(size.height * 9 / 16));
  const [activeIndex, setActiveIndex] = useState(0);
  // Reels the viewer has paused — or, under Reduce Motion, not yet started.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      setReels(await listReels());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setActiveIndex(first.index);
  }).current;

  const header = (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 64 }}>
      <Scrim stops={[[0, 0.7], [1, 0]]} />
      <Text style={{ ...fontUI(700), fontSize: 22, letterSpacing: -0.4, color: T.text, position: 'absolute', top: insets.top + 8, left: 16 }}>
        Discover
      </Text>
    </View>
  );

  let body: React.ReactNode;
  if (reels === null && !failed) {
    body = (
      <View accessible accessibilityLabel="Loading" style={{ flex: 1, width: reelWidth || '100%', alignSelf: 'center', justifyContent: 'flex-end', padding: 16, paddingBottom: FLOATING_TAB_CLEARANCE + 8, gap: 10 }}>
        <Skeleton width="55%" height={26} />
        <Skeleton width="35%" height={14} />
        <Skeleton width="80%" height={16} />
        <Skeleton width="100%" height={44} radius={22} />
      </View>
    );
  } else if (failed || !reels?.length) {
    body = (
      <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60 }}>
        <EmptyState
          title={failed ? "Couldn't load Discover." : 'Nothing to watch yet.'}
          body={failed ? 'Check your connection and try again.' : 'Venues will post clips here soon.'}
          action={failed ? <Btn onPress={load}>Try again</Btn> : undefined}
        />
      </View>
    );
  } else if (height > 0) {
    body = (
      <FlatList
        data={reels}
        keyExtractor={(r) => r.id}
        renderItem={({ item, index }) => {
          const paused = reduceMotion ? !toggled[item.id] : !!toggled[item.id];
          return (
            <ReelItem
              r={item}
              height={height}
              width={reelWidth}
              near={Math.abs(index - activeIndex) <= 1}
              playing={onScreen && index === activeIndex && !paused}
              paused={paused}
              onTogglePause={() => setToggled((t) => ({ ...t, [item.id]: !t[item.id] }))}
            />
          );
        }}
        extraData={[activeIndex, onScreen, toggled, reduceMotion]}
        getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
        pagingEnabled
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        windowSize={3}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        onRefresh={load}
        refreshing={false}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      {onScreen && <StatusBar style="light" />}
      {body}
      {header}
    </View>
  );
}

export default function DiscoverScreen() {
  return (
    <DarkScope>
      <DiscoverFeed />
    </DarkScope>
  );
}
