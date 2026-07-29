import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export const PRIVATE_CHAT_STARTERS = [
  'Hey! Are you still good for the game?',
  'Want to warm up beforehand?',
  'Should we meet 10 minutes early?',
  'Where should we meet?',
] as const;

export const GROUP_CHAT_STARTERS = [
  'Looking forward to playing! 🎾',
  'What court should we meet at?',
  'Is anyone bringing balls?',
  'How will we recognize each other?',
] as const;

type Props = {
  suggestions: readonly string[];
  onSelect: (text: string) => void;
  /** When false, chips start collapsed behind a Suggestions control. */
  expandedByDefault?: boolean;
  systemBanner?: string | null;
};

export default function ConversationStarters({
  suggestions,
  onSelect,
  expandedByDefault = true,
  systemBanner = null,
}: Props) {
  const [expanded, setExpanded] = useState(expandedByDefault);

  useEffect(() => {
    setExpanded(expandedByDefault);
  }, [expandedByDefault]);

  if (!suggestions.length) {
    return null;
  }

  return (
    <View style={styles.container}>
      {systemBanner ? (
        <View style={styles.systemBanner}>
          <Text style={styles.systemBannerText}>{systemBanner}</Text>
        </View>
      ) : null}

      {!expandedByDefault ? (
        <TouchableOpacity
          style={styles.toggleRow}
          onPress={() => setExpanded((current) => !current)}
          activeOpacity={0.75}
        >
          <Text style={styles.toggleText}>Suggestions</Text>
          <Text style={styles.toggleChevron}>{expanded ? '▾' : '▸'}</Text>
        </TouchableOpacity>
      ) : null}

      {expanded ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          keyboardShouldPersistTaps="handled"
        >
          {suggestions.map((suggestion) => (
            <TouchableOpacity
              key={suggestion}
              style={styles.chip}
              onPress={() => onSelect(suggestion)}
              activeOpacity={0.85}
            >
              <Text style={styles.chipText} numberOfLines={2}>
                {suggestion}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 4,
    paddingBottom: 8,
    gap: 8,
  },
  systemBanner: {
    marginHorizontal: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
  },
  systemBannerText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#4B5563',
    textAlign: 'center',
    fontWeight: '500',
  },
  toggleRow: {
    alignSelf: 'flex-start',
    marginLeft: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },
  toggleChevron: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '700',
  },
  chipsRow: {
    paddingHorizontal: 12,
    gap: 8,
  },
  chip: {
    maxWidth: 220,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#111827',
    fontWeight: '500',
  },
});
