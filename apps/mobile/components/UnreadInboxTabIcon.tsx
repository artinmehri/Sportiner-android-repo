import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useUnreadMessages } from '@/context/UnreadMessagesContext';

export function UnreadInboxTabIcon({ color }: { color: string }) {
  const { unreadCount } = useUnreadMessages();
  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <View
      accessible
      accessibilityLabel={unreadCount > 0 ? `Inbox, ${unreadCount} unread messages` : 'Inbox'}
      style={styles.container}
    >
      <Ionicons name="chatbubble" size={25} color={color} />
      {unreadCount > 0 ? (
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
