// The top of a drop's detail page: the deal's video, if the venue added one,
// then every venue photo, as one swipeable slideshow with page dots. With
// nothing uploaded it falls back to the category placeholder.

import { useEffect, useState } from 'react';
import { Image, ScrollView, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Placeholder, useReduceMotion } from './components';
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
            // Plays only while it's the page on screen, and never with Reduce Motion on.
            <HeroVideo key={p.url} url={p.url} poster={p.poster} playing={page === i && !reduceMotion} width={width} height={height} />
          ) : (
            <Image key={p.url} source={{ uri: p.url }} style={{ width, height }} resizeMode="cover" accessibilityIgnoresInvertColors />
          ),
        )}
      </ScrollView>
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
