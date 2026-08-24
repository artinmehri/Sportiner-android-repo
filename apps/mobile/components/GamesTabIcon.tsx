import { StyleSheet, Text, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useHostedGameJoins } from '@/context/HostedGameJoinsContext';

export function GamesTabIcon({ color }: { color: string }) {
  const { joinBadgeCount } = useHostedGameJoins();
  const badgeLabel = joinBadgeCount > 9 ? '9+' : String(joinBadgeCount);

  return (
    <View
      accessible
      accessibilityLabel={
        joinBadgeCount > 0
          ? `Games, ${joinBadgeCount} new player joins`
          : 'Games'
      }
      style={styles.container}
    >
      <IconSymbol size={28} name="gamecontroller.fill" color={color} />
      {joinBadgeCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badgeLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 28,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B30',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 11,
  },
});
