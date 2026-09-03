import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSearch } from '@/hooks/use-search';
import { useTheme } from '@/hooks/use-theme';
import { deriveTitle } from '@/utils/format';
import type { Note } from '@/types/note';

/** Builds a preview snippet centred on the first match, with the match marked. */
function snippet(content: string, query: string): { before: string; match: string; after: string } {
  const lower = content.toLowerCase();
  const index = lower.indexOf(query.toLowerCase());
  if (index === -1) {
    return { before: content.slice(0, 80), match: '', after: '' };
  }
  const start = Math.max(0, index - 24);
  const before = (start > 0 ? '…' : '') + content.slice(start, index).replace(/\n/g, ' ');
  const match = content.slice(index, index + query.length);
  const after = content.slice(index + query.length, index + query.length + 60).replace(/\n/g, ' ');
  return { before, match, after };
}

export default function SearchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { query, setQuery, results, searching } = useSearch();
  const inputRef = useRef<TextInput>(null);

  const renderItem = ({ item }: { item: Note }) => {
    const title = deriveTitle(item.content) || 'New Note';
    const { before, match, after } = snippet(item.content, query.trim());
    return (
      <Pressable
        onPress={() => router.push({ pathname: '/note/[id]', params: { id: item.id } })}
        android_ripple={{ color: theme.backgroundSelected }}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: pressed ? theme.backgroundSelected : theme.background },
        ]}>
        <ThemedText type="default" numberOfLines={1} style={styles.title}>
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {before}
          <ThemedText type="smallBold" style={{ color: theme.text }}>
            {match}
          </ThemedText>
          {after}
        </ThemedText>
      </Pressable>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <View style={[styles.field, { backgroundColor: theme.backgroundElement }]}>
          <Icon name="search" size={17} color={theme.textSecondary} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text }]}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button">
          <ThemedText type="default" style={{ color: theme.accent }}>
            Cancel
          </ThemedText>
        </Pressable>
      </View>

      <FlashList
        data={results}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={renderItem}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: theme.separator }]} />
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.four }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText type="small" themeColor="textSecondary">
              {query.trim().length === 0
                ? 'Search your notes'
                : searching
                  ? 'Searching…'
                  : 'No matching notes'}
            </ThemedText>
          </View>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: 38,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
  },
  icon: { fontSize: 15 },
  input: { flex: 1, fontSize: 16, padding: 0 },
  row: { paddingVertical: Spacing.three, paddingHorizontal: Spacing.four, gap: Spacing.one },
  title: { fontWeight: '600' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.four },
  empty: { alignItems: 'center', paddingTop: Spacing.six },
});
