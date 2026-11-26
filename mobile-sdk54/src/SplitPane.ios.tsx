// iOS split layout. On iOS 27.1+ the two panes go in the system's
// ArrangementView (SwiftUI, via @expo/ui), which decides where the split goes:
// on a partially open iPhone Duo it puts it on the fold, so nothing sits in
// the crease (Apple: "nothing you need sits in the fold"). Each pane is still
// a React Native view, hosted with RNHostView.
//
// Below iOS 27.1 ArrangementView renders its children with no container, so
// those versions use the flexbox SplitPane instead.
import { Platform, View } from 'react-native';
import { ArrangementView, Host, RNHostView, VStack } from '@expo/ui/swift-ui';
import { arrangementViewStyle, splitArrangementLayoutSize } from '@expo/ui/swift-ui/modifiers';
import { useListPaneWidth, useSplitAxis } from './layout';
import { PaneInsets, SplitPane as FlexSplitPane, type SplitPaneProps } from './SplitPane.shared';

const HAS_ARRANGEMENT = parseFloat(String(Platform.Version)) >= 27.1;

export function SplitPane(props: SplitPaneProps) {
  const listWidth = useListPaneWidth();
  const axis = useSplitAxis();
  if (!HAS_ARRANGEMENT) return <FlexSplitPane {...props} />;
  return (
    // The panes handle safe areas themselves (PaneInsets); without this the
    // SwiftUI host also kept clear of the home indicator, leaving a strip
    // across the bottom of both panes.
    <Host style={{ flex: 1 }} ignoreSafeArea="container">
      <ArrangementView modifiers={[arrangementViewStyle('split', { axes: axis })]}>
        <ArrangementView.Primary>
          {/* Side by side: ideally half the window, so on an open, flat Duo the
              split sits on the hinge. Keep a range, though: pinning min = max
              stopped the system placing the split on the fold when half open,
              and both panes rendered blank.
              Top and bottom (upright and partially open, useSplitAxis()): no
              size, so the system puts the split on the fold. */}
          <VStack modifiers={axis === 'horizontal'
            ? [splitArrangementLayoutSize({ minWidth: 320, idealWidth: listWidth, maxWidth: Math.max(480, listWidth) })]
            : []}>
            <RNHostView>
              <View style={{ flex: 1 }}>
                <PaneInsets side="leading" axis={axis}>{props.list}</PaneInsets>
              </View>
            </RNHostView>
          </VStack>
        </ArrangementView.Primary>
        <ArrangementView.Secondary>
          <RNHostView>
            <View style={{ flex: 1 }}>
              <PaneInsets side="trailing" axis={axis}>{props.detail}</PaneInsets>
            </View>
          </RNHostView>
        </ArrangementView.Secondary>
      </ArrangementView>
    </Host>
  );
}

export type { SplitPaneProps };
