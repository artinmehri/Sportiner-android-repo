import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

export type ShareCardData = {
  name: string;
  profileImage: string;
  daysToComplete: number;
  skillLevel: string;
  status: string;
  matchStatus: string;
  timestamp: string;
};

type ShareCardProps = {
  data: ShareCardData;
};

export default function ShareCard({ data }: ShareCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Image 
          source={{ uri: data.profileImage }} 
          style={styles.profileImage} 
        />
        <View style={styles.headerText}>
          <Text style={styles.name}>{data.name}</Text>
          <Text style={styles.skillLevel}>{data.skillLevel}</Text>
        </View>
      </View>
      
      <View style={styles.statusSection}>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{data.status}</Text>
        </View>
        <Text style={styles.matchStatus}>{data.matchStatus}</Text>
      </View>
      
      <View style={styles.footer}>
        <Text style={styles.daysText}>
          Completed in {data.daysToComplete} days
        </Text>
        <Text style={styles.timestamp}>{data.timestamp}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 1080,
    height: 1920,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 40,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginRight: 24,
  },
  headerText: {
    flex: 1,
  },
  name: {
    fontSize: 48,
    fontWeight: '900',
    color: '#000',
    marginBottom: 8,
  },
  skillLevel: {
    fontSize: 32,
    fontWeight: '600',
    color: '#666',
  },
  statusSection: {
    alignItems: 'center',
    marginVertical: 40,
  },
  statusBadge: {
    backgroundColor: '#19E675',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  statusText: {
    fontSize: 36,
    fontWeight: '800',
    color: '#000',
  },
  matchStatus: {
    fontSize: 28,
    fontWeight: '600',
    color: '#000',
  },
  footer: {
    alignItems: 'center',
  },
  daysText: {
    fontSize: 32,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  timestamp: {
    fontSize: 24,
    fontWeight: '500',
    color: '#999',
  },
});
