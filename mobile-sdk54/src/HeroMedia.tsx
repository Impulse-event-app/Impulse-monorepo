// The top of a drop's detail page: the deal's video, if the venue added one,
// then every venue photo, as one swipeable slideshow with page dots. With
// nothing uploaded it falls back to the category placeholder.

import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Modal, PanResponder, Pressable, ScrollView, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Placeholder, useReduceMotion } from './components';
import { Close, Play } from './icons';
import type { Drop } from './data';

type Page = { kind: 'video'; url: string; poster: string | null } | { kind: 'photo'; url: string };

function HeroVideo({ url, poster, playing, width, height }: { url: string; poster: string | null; playing: boolean; width: number; height: number }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
    p.audioMixingMode = 'mixWithOthers';   // never interrupt the user's music
  });
  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [playing, player]);
  return (
    <View style={{ width, height, backgroundColor: '#000' }}>
      {poster && <Image source={{ uri: poster }} style={{ position: 'absolute', width, height }} resizeMode="cover" accessibilityIgnoresInvertColors />}
      <VideoView player={player} style={{ width, height }} contentFit="cover" nativeControls={false} allowsPictureInPicture={false} />
    </View>
  );
}

/**
 * The deal's video, full screen like a reel, with sound. Drag down (it follows
 * your finger) or tap the X to go back to the deal; tap to pause and play.
 */
function FullscreenVideo({ url, onClose }: { url: string; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [paused, setPaused] = useState(false);
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = false;
    p.play();
  });
  useEffect(() => {
    if (paused) player.pause();
    else player.play();
  }, [paused, player]);

  const dragY = useRef(new Animated.Value(0)).current;
  const close = useRef(onClose);
  close.current = onClose;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => dragY.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 120 || g.vy > 0.8) {
          Animated.timing(dragY, { toValue: height, duration: 180, useNativeDriver: true }).start(() => close.current());
        } else {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;
  const backdrop = dragY.interpolate({ inputRange: [0, height * 0.6], outputRange: [1, 0], extrapolate: 'clamp' });
  const scale = dragY.interpolate({ inputRange: [0, height], outputRange: [1, 0.85], extrapolate: 'clamp' });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar style="light" />
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', opacity: backdrop }} />
      <Animated.View style={{ flex: 1, transform: [{ translateY: dragY }, { scale }] }} {...pan.panHandlers}>
        <Pressable
          style={{ flex: 1 }}
          onPress={() => setPaused((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={paused ? 'Play video' : 'Pause video'}
          accessibilityHint="Swipe down to go back to the deal."
        >
          <VideoView player={player} style={{ width, height }} contentFit="cover" nativeControls={false} allowsPictureInPicture={false} />
          {paused && (
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                <Play size={30} color="#fff" />
              </View>
            </View>
          )}
        </Pressable>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close video"
          style={{ position: 'absolute', top: insets.top + 8, left: insets.left + 16, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Close size={14} color="#fff" />
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

export function HeroMedia({ d, height: preferredHeight }: { d: Drop; height: number }) {
  // Size to our own container, not the window: in the split layout (open
  // iPhone Duo, iPad) the hero sits in the detail pane, which is narrower than
  // the window. The window width is only the first-frame guess. Re-measured on
  // every layout, so a fold or unfold mid-session resizes the pages.
  const window = useWindowDimensions();
  const [measured, setMeasured] = useState(0);
  const width = measured || window.width;
  // Never more than ~45% of the window's height, so a short, wide window (an
  // open Duo in landscape) still shows the deal below the hero.
  const height = Math.min(preferredHeight, Math.round(window.height * 0.45));
  const reduceMotion = useReduceMotion();
  const [page, setPage] = useState(0);
  // The video opened full screen (tap the video page).
  const [fullscreen, setFullscreen] = useState(false);

  const pages: Page[] = [
    ...(d.video ? [{ kind: 'video' as const, url: d.video.url, poster: d.video.poster }] : []),
    ...d.images.map((url) => ({ kind: 'photo' as const, url })),
  ];

  if (pages.length === 0) {
    return <Placeholder label={d.cat} style={{ height }} />;
  }

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
    if (i !== page) setPage(i);
  };

  return (
    <View style={{ height }} onLayout={(e) => setMeasured(Math.round(e.nativeEvent.layout.width))}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        accessibilityLabel={`${d.venue} photos${d.video ? ' and video' : ''}, ${pages.length} in all. Swipe to see more.`}
      >
        {pages.map((p, i) =>
          p.kind === 'video' ? (
            // Plays only while it's the page on screen (and not open full
            // screen), and never with Reduce Motion on. Tap to watch full screen.
            <Pressable
              key={p.url}
              onPress={() => setFullscreen(true)}
              accessibilityRole="button"
              accessibilityLabel="Watch the video full screen"
            >
              <HeroVideo url={p.url} poster={p.poster} playing={page === i && !reduceMotion && !fullscreen} width={width} height={height} />
            </Pressable>
          ) : (
            <Image key={p.url} source={{ uri: p.url }} style={{ width, height }} resizeMode="cover" accessibilityIgnoresInvertColors />
          ),
        )}
      </ScrollView>
      {fullscreen && d.video ? <FullscreenVideo url={d.video.url} onClose={() => setFullscreen(false)} /> : null}
      {pages.length > 1 && (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 12, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          {pages.map((p, i) => (
            <View key={p.url} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === page ? '#FFFFFF' : 'rgba(255,255,255,0.45)' }} />
          ))}
        </View>
      )}
    </View>
  );
}
