import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 32; 

type GameStatus = {
  type: 'spots' | 'booked' | 'pending' | 'full';
  label: string;
  color: string;
  icon: string;
};

type GameCard = {
  id: string;
  title: string;
  level: string;
  distance: string;
  address: string;
  cost: string;
  time: string;
  avatar: string;
  statuses: GameStatus[];
};

const hostingGames: GameCard[] = [
  {
    id: '1',
    title: "Alex's Tennis Doubles",
    level: 'Advanced',
    distance: '500m',
    address: '300 Steels Avenue',
    cost: '$10 Entry',
    time: 'Today • 10:30 PM',
    avatar: 'https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=200&q=60',
    statuses: [
      { type: 'spots', label: '2 Left', color: '#FF9500', icon: 'person' },
      { type: 'booked', label: 'Court booked', color: '#19E675', icon: 'checkmark' },
    ],
  },
  {
    id: '2',
    title: "Alex's Tennis Doubles",
    level: 'Advanced',
    distance: '500m',
    address: '300 Steels Avenue',
    cost: '$10 Entry',
    time: 'Today • 10:30 PM',
    avatar: 'https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=200&q=60',
    statuses: [
      { type: 'full', label: 'Full', color: '#19E675', icon: 'people' },
      { type: 'booked', label: 'Court booked', color: '#19E675', icon: 'checkmark' },
    ],
  },
];

const playingGames: GameCard[] = [
  {
    id: '3',
    title: "Alex's Tennis Doubles",
    level: 'Advanced',
    distance: '500m',
    address: '300 Steels Avenue',
    cost: '$10 Entry',
    time: 'Today • 10:30 PM',
    avatar: 'https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=200&q=60',
    statuses: [
      { type: 'pending', label: 'Pending', color: '#FFD700', icon: 'bar-chart' },
    ],
  },
];

export default function Games() {
  const [activeTab, setActiveTab] = useState<'Past' | 'Upcoming'>('Upcoming');
  const hostingScrollRef = useRef<ScrollView>(null);
  const playingScrollRef = useRef<ScrollView>(null);
  const [hostingScrollIndex, setHostingScrollIndex] = useState(0);
  const [playingScrollIndex, setPlayingScrollIndex] = useState(0);

  const getLevelColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'advanced':
        return '#19E675'; 
      case 'intermediate':
        return '#FFD700'; 
      case 'beginner':
        return '#FF0000'; 
      default:
        return '#000000'; 
    }
  };

  const scrollHosting = (direction: 'left' | 'right') => {
    const newIndex = direction === 'right' ? hostingScrollIndex + 1 : hostingScrollIndex - 1;
    if (newIndex >= 0 && newIndex < hostingGames.length) {
      hostingScrollRef.current?.scrollTo({ x: newIndex * CARD_WIDTH, animated: true });
      setHostingScrollIndex(newIndex);
    }
  };

  const scrollPlaying = (direction: 'left' | 'right') => {
    const newIndex = direction === 'right' ? playingScrollIndex + 1 : playingScrollIndex - 1;
    if (newIndex >= 0 && newIndex < playingGames.length) {
      playingScrollRef.current?.scrollTo({ x: newIndex * CARD_WIDTH, animated: true });
      setPlayingScrollIndex(newIndex);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header with Tabs */}
      <View style={styles.header}>
        <View style={styles.headerCenter}>
          {/* Toggle Switch */}
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[styles.toggleOption, activeTab === 'Past' && styles.toggleOptionActive]}
              onPress={() => setActiveTab('Past')}
            >
              {activeTab === 'Past' && (
                <Ionicons name="checkmark" size={11} color="#000000" style={styles.toggleCheck} />
              )}
              <Text style={[styles.toggleText, activeTab === 'Past' && styles.toggleTextActive]}>Past</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleOption, activeTab === 'Upcoming' && styles.toggleOptionActive]}
              onPress={() => setActiveTab('Upcoming')}
            >
              {activeTab === 'Upcoming' && (
                <Ionicons name="checkmark" size={11} color="#000000" style={styles.toggleCheck} />
              )}
              <Text style={[styles.toggleText, activeTab === 'Upcoming' && styles.toggleTextActive]}>Upcoming</Text>
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity style={styles.notificationButton}>
          <Ionicons name="mail-outline" size={24} color="#000" />
          <View style={styles.notificationBadge}>
            <Text style={styles.notificationText}>3</Text>
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Hosting Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hosting</Text>
          <View style={styles.horizontalScrollContainer}>
            {hostingScrollIndex > 0 && (
              <TouchableOpacity
                style={styles.scrollArrowLeft}
                onPress={() => scrollHosting('left')}
              >
                <Ionicons name="chevron-back" size={24} color="#000" />
              </TouchableOpacity>
            )}
            <ScrollView
              ref={hostingScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              pagingEnabled
              onScroll={(e) => {
                const index = Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH);
                setHostingScrollIndex(index);
              }}
              scrollEventThrottle={16}
            >
              {hostingGames.map((game, index) => (
                <View key={game.id} style={[styles.card, index === 0 && styles.firstCard, index === hostingGames.length - 1 && styles.lastCard]}>
                  <View style={styles.cardHeader}>
                    <Image source={{ uri: game.avatar }} style={styles.avatar} />
                    <Text style={styles.cardTitle}>{game.title}</Text>
                  </View>
                  <View style={styles.cardDetails}>
                    <Text style={styles.detailText}>
                      <Text style={{ color: getLevelColor(game.level), fontWeight: '700' }}>{game.level}</Text> • {game.distance}
                    </Text>
                    <Text style={styles.detailText}>
                      {game.address} • {game.cost}
                    </Text>
                    <Text style={styles.detailText}>{game.time}</Text>
                  </View>
                  <View style={styles.statusContainer}>
                    {game.statuses.map((status, index) => (
                      <View
                        key={index}
                        style={[styles.statusPill, { backgroundColor: status.color }]}
                      >
                        <Ionicons name={status.icon as any} size={14} color="#FFFFFF" />
                        <Text style={styles.statusText}>{status.label}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.actionBar}>
                    <TouchableOpacity style={styles.actionButton}>
                      <Ionicons name="chatbubble-outline" size={20} color="#000" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton}>
                      <Ionicons name="location-outline" size={20} color="#000" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton}>
                      <Ionicons name="calendar-outline" size={20} color="#000" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton}>
                      <Ionicons name="ellipsis-vertical" size={20} color="#000" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
            {hostingScrollIndex < hostingGames.length - 1 && (
              <TouchableOpacity
                style={styles.scrollArrowRight}
                onPress={() => scrollHosting('right')}
              >
                <Ionicons name="chevron-forward" size={24} color="#000" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Playing Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Playing</Text>
          <View style={styles.horizontalScrollContainer}>
            {playingScrollIndex > 0 && (
              <TouchableOpacity
                style={styles.scrollArrowLeft}
                onPress={() => scrollPlaying('left')}
              >
                <Ionicons name="chevron-back" size={24} color="#000" />
              </TouchableOpacity>
            )}
            <ScrollView
              ref={playingScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              pagingEnabled
              onScroll={(e) => {
                const index = Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH);
                setPlayingScrollIndex(index);
              }}
              scrollEventThrottle={16}
            >
              {playingGames.map((game, index) => (
                <View key={game.id} style={[styles.card, index === 0 && styles.firstCard, index === playingGames.length - 1 && styles.lastCard]}>
                  <View style={styles.cardHeader}>
                    <Image source={{ uri: game.avatar }} style={styles.avatar} />
                    <Text style={styles.cardTitle}>{game.title}</Text>
                  </View>
                  <View style={styles.cardDetails}>
                    <Text style={styles.detailText}>
                      <Text style={{ color: getLevelColor(game.level), fontWeight: '700' }}>{game.level}</Text> • {game.distance}
                    </Text>
                    <Text style={styles.detailText}>
                      {game.address} • {game.cost}
                    </Text>
                    <Text style={styles.detailText}>{game.time}</Text>
                  </View>
                  <View style={styles.statusContainer}>
                    {game.statuses.map((status, index) => (
                      <View
                        key={index}
                        style={[styles.statusPill, { backgroundColor: status.color }]}
                      >
                        <Ionicons name={status.icon as any} size={14} color="#FFFFFF" />
                        <Text style={styles.statusText}>{status.label}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.actionBar}>
                    <TouchableOpacity style={styles.actionButton}>
                      <Ionicons name="chatbubble-outline" size={20} color="#000" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton}>
                      <Ionicons name="location-outline" size={20} color="#000" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton}>
                      <Ionicons name="calendar-outline" size={20} color="#000" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton}>
                      <Ionicons name="ellipsis-vertical" size={20} color="#000" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
            {playingScrollIndex < playingGames.length - 1 && (
              <TouchableOpacity
                style={styles.scrollArrowRight}
                onPress={() => scrollPlaying('right')}
              >
                <Ionicons name="chevron-forward" size={24} color="#000" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  toggleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 15,
    gap: 3,
  },
  toggleOptionActive: {
    backgroundColor: '#19E675',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  toggleTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  toggleCheck: {
    marginRight: -1,
  },
  notificationButton: {
    position: 'relative',
    padding: 4,
  },
  notificationBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#FF0000',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  notificationText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginTop: 24,
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  horizontalScrollContainer: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  scrollArrowLeft: {
    position: 'absolute',
    left: 8,
    zIndex: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  scrollArrowRight: {
    position: 'absolute',
    right: 8,
    zIndex: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  firstCard: {
    marginLeft: 16,
  },
  lastCard: {
    marginRight: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  cardTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: '#000',
  },
  cardDetails: {
    marginBottom: 12,
    gap: 4,
  },
  detailText: {
    fontSize: 16,
    color: '#000',
    fontWeight: '400',
  },
  statusContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 6,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  actionButton: {
    padding: 8,
  },
});

