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
import { LIST_PANE_WIDTH } from './layout';
import { DetailCard, ListPane, SplitPane as FlexSplitPane, type SplitPaneProps } from './SplitPane.shared';

const HAS_ARRANGEMENT = parseFloat(String(Platform.Version)) >= 27.1;

export function SplitPane(props: SplitPaneProps) {
  if (!HAS_ARRANGEMENT) return <FlexSplitPane {...props} />;
  return (
    <Host style={{ flex: 1 }}>
      <ArrangementView modifiers={[arrangementViewStyle('split', { axes: 'horizontal' })]}>
        <ArrangementView.Primary>
          <VStack modifiers={[splitArrangementLayoutSize({ minWidth: 320, idealWidth: LIST_PANE_WIDTH, maxWidth: 480 })]}>
            <RNHostView>
              <View style={{ flex: 1 }}>
                <ListPane>{props.list}</ListPane>
              </View>
            </RNHostView>
          </VStack>
        </ArrangementView.Primary>
        <ArrangementView.Secondary>
          <RNHostView>
            <View style={{ flex: 1 }}>
              <DetailCard>{props.detail}</DetailCard>
            </View>
          </RNHostView>
        </ArrangementView.Secondary>
      </ArrangementView>
    </Host>
  );
}

export type { SplitPaneProps };
