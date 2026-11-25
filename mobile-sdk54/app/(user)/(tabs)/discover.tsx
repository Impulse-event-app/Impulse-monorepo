import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import { useVideoPlayer, VideoView } from 'expo-video';
import { AppState, FlatList, Image, Platform, Pressable, Text, useWindowDimensions, View, type ListViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DarkScope, fontMono, fontUI, useApp } from '../../../src/theme';
import { Btn, EmptyState, Scrim, Skeleton, unitShort, useReduceMotion } from '../../../src/components';
import { Play, Speaker } from '../../../src/icons';
import { canonicalCat, money } from '../../../src/data';
import { listReels, type ApiReel } from '../../../src/api';
import { reportTabScroll } from '../../../src/tabBarScroll';
import { setSelectedDeal, useLayoutMode, useSelectedDeal, useSideInsets, useTabBarClearance } from '../../../src/layout';
import { SplitPane } from '../../../src/SplitPane';
import { DealDetail } from '../../../src/DealDetail';

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

// Sound on reels, shared by every reel and remembered while the app runs:
// on by default, like Instagram; the speaker button toggles it.
let reelsMuted = false;
const muteListeners = new Set<() => void>();
function setReelsMuted(m: boolean) { reelsMuted = m; muteListeners.forEach((l) => l()); }
function useReelsMuted(): boolean {
  return useSyncExternalStore(
    (l) => { muteListeners.add(l); return () => { muteListeners.delete(l); }; },
    () => reelsMuted,
    () => reelsMuted,
  );
}

/** The player for the reel on screen (and its neighbours, so a swipe starts instantly). */
function ReelVideo({ uri, playing, fast, width, height }: { uri: string; playing: boolean; fast: boolean; width: number; height: number }) {
  const muted = useReelsMuted();
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = reelsMuted;
    // With sound on, pause the user's music while a reel plays (Instagram
    // does the same); muted, leave their music alone.
    p.audioMixingMode = reelsMuted ? 'mixWithOthers' : 'doNotMix';
  });
  useEffect(() => {
    player.muted = muted;
    player.audioMixingMode = muted ? 'mixWithOthers' : 'doNotMix';
  }, [muted, player]);
  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [playing, player]);
  // Held on the right half: 2x, like Instagram.
  useEffect(() => {
    player.playbackRate = fast ? 2 : 1;
  }, [fast, player]);
  // Explicit size: on web the <video> doesn't take its box from absolute insets alone.
  return <VideoView player={player} style={{ position: 'absolute', top: 0, left: 0, width, height }} contentFit="cover" nativeControls={false} allowsPictureInPicture={false} />;
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
  const tabClearance = useTabBarClearance();
  // Pad for the window's safe areas only when the reel reaches the window's
  // edges. On a wide window (landscape) the 9:16 reel sits in the middle,
  // clear of the Dynamic Island or rail, and the insets would squash its text.
  const windowWidth = useWindowDimensions().width;
  const edgeInsets = useSideInsets(16);
  const sideInsets = width >= windowWidth - 1 ? edgeInsets : { paddingLeft: 16, paddingRight: 16 };
  const { T, apiDeals } = useApp();
  const router = useRouter();
  const layoutMode = useLayoutMode();
  const poster = r.poster_url ?? r.venue_image_url;
  // Book only when the feed still has this deal — the event page reads from the same list.
  const bookable = !!r.deal_id && !!apiDeals[r.deal_id];
  const muted = useReelsMuted();
  // Press and hold the right half of the reel to watch at 2x; let go for 1x.
  const [fast, setFast] = useState(false);
  useEffect(() => { if (!playing) setFast(false); }, [playing]);

  return (
    <View style={{ height, width, alignSelf: 'center', overflow: 'hidden', backgroundColor: '#000' }}>
      {poster ? <Image source={{ uri: poster }} style={[FILL, { width: '100%', height: '100%' }]} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
      {near && <ReelVideo uri={r.video_url} playing={playing} fast={fast && playing} width={width} height={height} />}

      <Pressable
        onPress={onTogglePause}
        delayLongPress={250}
        onLongPress={(e) => { if (playing && e.nativeEvent.locationX > width / 2) setFast(true); }}
        onPressOut={() => setFast(false)}
        style={FILL}
        accessibilityRole="button"
        accessibilityLabel={reelA11yLabel(r, bookable)}
        accessibilityHint={paused ? 'Plays the video. Swipe up for the next venue.' : 'Pauses the video. Swipe up for the next venue.'}
      >
        {fast && (
          <View pointerEvents="none" style={{ position: 'absolute', top: 110, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <Text style={{ ...fontUI(600), fontSize: 14, color: '#fff' }}>2× ▸▸</Text>
          </View>
        )}
        {paused && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ alignItems: 'center' }}>
              {/* Sound toggle, small, just above the play button (only while
                  paused). Positioned so the play button stays dead centre. */}
              <Pressable
                onPress={() => setReelsMuted(!muted)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={muted ? 'Turn sound on' : 'Mute'}
                style={({ pressed }) => ({
                  position: 'absolute', bottom: 68 + 14,
                  width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: 'rgba(0,0,0,0.45)', opacity: pressed ? 0.7 : 1,
                })}
              >
                <Speaker size={18} color="#fff" muted={muted} />
              </Pressable>
              {/* No extra left nudge: the Play glyph is already drawn a touch right
                  of its box's centre, which is what centres a triangle optically. */}
              <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                <Play size={30} color="#fff" />
              </View>
            </View>
          </View>
        )}
      </Pressable>

      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <Scrim stops={[[0, 0], [0.35, 0.55], [1, 0.92]]} style={{ top: -80 }} />
        <View pointerEvents="box-none" style={{ ...sideInsets, paddingBottom: tabClearance + 8, gap: 10 }}>
          <Text numberOfLines={1} style={{ ...fontUI(600), fontSize: 24, letterSpacing: -0.45, color: T.text }}>
            {r.venue_name}
          </Text>
          {/* A short line under the name: the venue's own description. Until
              the backend sends it, the clip's caption, then the deal's name. */}
          {!!(r.venue_description || r.caption || (bookable && r.deal_title)) && (
            <Text numberOfLines={2} style={{ ...fontUI(400), fontSize: 15, lineHeight: 20, color: T.text, opacity: 0.9 }}>
              {r.venue_description || r.caption || r.deal_title}
            </Text>
          )}
          {bookable ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
              {/* Was, then now, like the feed cards. */}
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                {r.original_price && r.original_price > (r.deal_price ?? 0) ? (
                  <Text style={{ ...fontMono(500), fontSize: 15, letterSpacing: -0.3, color: T.muted, textDecorationLine: 'line-through' }}>
                    {money(r.original_price)}
                  </Text>
                ) : null}
                <Text style={{ ...fontMono(600), fontSize: 22, letterSpacing: -0.4, color: T.text }}>
                  {money(r.deal_price ?? 0)}
                  <Text style={{ ...fontUI(400), fontSize: 13, letterSpacing: -0.05, color: T.muted }}>{unitShort(r.unit ?? '')}</Text>
                </Text>
              </View>
              {/* Open Duo / split layout: no Book here, the drop's own Book now
                  is in the detail pane beside the reel. */}
              {layoutMode === 'split' ? null : (
                <Btn small onPress={() => router.push(`/(user)/event/${r.deal_id}`)} accessibilityHint="Opens the drop to book.">
                  Book
                </Btn>
              )}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/**
 * A fixed blur from the tab bar's top edge to the bottom edge of the screen.
 * While you swipe between reels, the edge between two clips slides behind the
 * glass tab bar and showed through as a hard line; under this blur it doesn't.
 * Without a mask library, the fade comes from stacked layers: each one runs
 * to the bottom and starts a little lower, so the blur builds up downwards
 * with no hard top edge. iOS only.
 */
const BLUR_STEPS = [0.0, 0.25, 0.5, 0.75];
function BottomBlur({ height }: { height: number }) {
  if (Platform.OS !== 'ios' || height <= 0) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}>
      {BLUR_STEPS.map((start) => (
        <BlurView
          key={start}
          intensity={14}
          tint="dark"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: Math.round(height * start) }}
        />
      ))}
    </View>
  );
}

/**
 * `fill`: reels span the full width even on a wide window (the split layout's
 * list pane). Portrait-shaped windows always fill.
 * `onActiveDeal`: called with the playing reel's live drop (or null), so the
 * split layout's detail pane can follow the reel on screen.
 */
function DiscoverFeed({ fill = false, onActiveDeal }: { fill?: boolean; onActiveDeal?: (dealId: string | null) => void }) {
  const tabClearance = useTabBarClearance();
  const { T, apiDeals } = useApp();
  const insets = useSafeAreaInsets();
  const onScreen = useOnScreen();
  const reduceMotion = useReduceMotion();
  const [reels, setReels] = useState<ApiReel[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const height = size.height;
  // Fill the width on any portrait-shaped window: a folded iPhone Duo's outer
  // screen (about 466×678pt) is squatter than 9:16 and got black bars. Only a
  // wide window (a desktop browser) keeps the centred 9:16 column.
  const reelWidth = fill || size.width <= size.height ? size.width : Math.min(size.width, Math.round(size.height * 9 / 16));
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

  // The playing reel's drop, if it has one live right now.
  const activeReel = reels?.[activeIndex];
  const activeDeal = activeReel?.deal_id && apiDeals[activeReel.deal_id] ? activeReel.deal_id : null;
  useEffect(() => {
    onActiveDeal?.(activeDeal);
  }, [activeDeal, onActiveDeal]);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setActiveIndex(first.index);
  }).current;

  const header = (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 64 }}>
      <Scrim stops={[[0, 0.7], [1, 0]]} />
      <Text style={{ ...fontUI(700), fontSize: 22, letterSpacing: -0.4, color: T.text, position: 'absolute', top: insets.top + 8, left: insets.left + 16 }}>
        Discover
      </Text>
    </View>
  );

  let body: React.ReactNode;
  if (reels === null && !failed) {
    body = (
      <View accessible accessibilityLabel="Loading" style={{ flex: 1, backgroundColor: '#000', width: reelWidth || '100%', alignSelf: 'center', justifyContent: 'flex-end', padding: 16, paddingBottom: tabClearance + 8, gap: 10 }}>
        <Skeleton width="55%" height={26} />
        <Skeleton width="35%" height={14} />
        <Skeleton width="80%" height={16} />
        <Skeleton width="100%" height={44} radius={22} />
      </View>
    );
  } else if (failed || !reels?.length) {
    body = (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', paddingBottom: 60 }}>
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
        style={{ backgroundColor: '#000' }}
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
        onScroll={(e) => reportTabScroll(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        onRefresh={load}
        refreshing={false}
      />
    );
  }

  return (
    // Black is on each body (loading, empty, the reel list), not this root.
    <View style={{ flex: 1 }} onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      {onScreen && <StatusBar style="light" />}
      {body}
      {/* From the bar's top edge down: any higher and it blurs the reel's text. */}
      {reels?.length ? <BottomBlur height={tabClearance} /> : null}
      {header}
    </View>
  );
}

export default function DiscoverScreen() {
  const { T } = useApp();
  // Split layout (open iPhone Duo, iPad): reels fill the list pane, and the
  // detail pane shows the drop of the reel that's playing.
  const selected = useSelectedDeal('discover');
  const followReel = useCallback((id: string | null) => setSelectedDeal(id, 'discover'), []);
  // Unlike Home, folding doesn't open the drop full screen: the pane follows
  // whatever reel is playing, so the viewer never chose it. Folded, the reels
  // just carry on.
  const layoutMode = useLayoutMode();

  const feed = (
    <DarkScope>
      <DiscoverFeed fill={layoutMode === 'split'} onActiveDeal={followReel} />
    </DarkScope>
  );
  if (layoutMode === 'compact') return feed;
  return (
    <SplitPane
      list={feed}
      detail={selected ? (
        <DealDetail id={selected} embedded />
      ) : (
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: T.bg }}>
          <EmptyState title="No drop live for this clip" body="Swipe to a clip with a live drop to see it here." />
        </View>
      )}
    />
  );
}
