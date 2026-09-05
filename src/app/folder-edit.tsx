import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { createFolder, createSmartFolder, getFolder, renameFolder } from '@/database/foldersRepository';
import { useTheme } from '@/hooks/use-theme';
import type { SmartRule } from '@/types/folder';

type RuleType = SmartRule['type'];

const RULE_OPTIONS: { type: RuleType; label: string }[] = [
  { type: 'keyword', label: 'Contains keyword' },
  { type: 'has-attachment', label: 'Has attachment' },
  { type: 'recent', label: 'Edited in last 7 days' },
  { type: 'pinned', label: 'Pinned notes' },
];

export default function FolderEditScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isRename = Boolean(id);
  const [name, setName] = useState('');
  const [smart, setSmart] = useState(false);
  const [ruleType, setRuleType] = useState<RuleType>('keyword');
  const [keyword, setKeyword] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    let active = true;
    if (id) {
      getFolder(id).then((folder) => {
        if (active && folder) setName(folder.name);
      });
    }
    return () => {
      active = false;
    };
  }, [id]);

  const keywordNeeded = smart && ruleType === 'keyword';
  const canSave = name.trim().length > 0 && (!keywordNeeded || keyword.trim().length > 0);

  const buildRule = (): SmartRule => {
    switch (ruleType) {
      case 'keyword':
        return { type: 'keyword', value: keyword.trim() };
      case 'recent':
        return { type: 'recent', days: 7 };
      case 'has-attachment':
        return { type: 'has-attachment' };
      case 'pinned':
        return { type: 'pinned' };
    }
  };

  const handleSave = async () => {
    if (!canSave) return;
    if (isRename && id) {
      await renameFolder(id, name);
    } else if (smart) {
      await createSmartFolder(name, buildRule());
    } else {
      await createFolder(name);
    }
    router.back();
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Insets keep the header clear of the status bar / notch on full-screen
            modals, and let content breathe in landscape. */}
        <View
          style={[
            styles.header,
            {
              paddingTop: Math.max(insets.top, Spacing.two),
              paddingLeft: Spacing.four + insets.left,
              paddingRight: Spacing.four + insets.right,
            },
          ]}>
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button">
            <ThemedText type="default" style={{ color: theme.accent }}>
              Cancel
            </ThemedText>
          </Pressable>
          <ThemedText type="default" style={styles.title}>
            {isRename ? 'Rename Folder' : 'New Folder'}
          </ThemedText>
          <Pressable onPress={handleSave} hitSlop={8} disabled={!canSave} accessibilityRole="button">
            <ThemedText
              type="default"
              style={{ color: canSave ? theme.accent : theme.textSecondary, fontWeight: '600' }}>
              {isRename ? 'Save' : 'Done'}
            </ThemedText>
          </Pressable>
        </View>

        <View
          style={[
            styles.body,
            { paddingLeft: Spacing.three + insets.left, paddingRight: Spacing.three + insets.right },
          ]}>
          {/* maxWidth centers the field on tablets/large screens instead of
              stretching edge to edge. */}
          <View style={styles.field}>
            <TextInput
              ref={inputRef}
              value={name}
              onChangeText={setName}
              placeholder="Folder Name"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSave}
              maxLength={60}
            />

            {!isRename && (
              <>
                <View style={[styles.smartToggle, { backgroundColor: theme.backgroundElement }]}>
                  <View style={styles.smartToggleLabel}>
                    <Icon name="smart-folder" size={18} color={theme.accent} />
                    <ThemedText type="default">Smart Folder</ThemedText>
                  </View>
                  <Switch value={smart} onValueChange={setSmart} />
                </View>
                <ThemedText type="small" themeColor="textSecondary" style={styles.smartHint}>
                  A smart folder automatically collects notes that match a rule.
                </ThemedText>

                {smart && (
                  <View style={[styles.ruleGroup, { backgroundColor: theme.backgroundElement }]}>
                    {RULE_OPTIONS.map((opt, i) => (
                      <Pressable
                        key={opt.type}
                        onPress={() => setRuleType(opt.type)}
                        style={({ pressed }) => [
                          styles.ruleRow,
                          i > 0 && {
                            borderTopWidth: StyleSheet.hairlineWidth,
                            borderTopColor: theme.separator,
                          },
                          { opacity: pressed ? 0.6 : 1 },
                        ]}>
                        <ThemedText type="default">{opt.label}</ThemedText>
                        {ruleType === opt.type && (
                          <Icon name="check" size={18} color={theme.accent} />
                        )}
                      </Pressable>
                    ))}
                  </View>
                )}

                {keywordNeeded && (
                  <TextInput
                    value={keyword}
                    onChangeText={setKeyword}
                    placeholder="Keyword (e.g. invoice)"
                    placeholderTextColor={theme.textSecondary}
                    style={[
                      styles.input,
                      styles.keywordInput,
                      { backgroundColor: theme.backgroundElement, color: theme.text },
                    ]}
                    returnKeyType="done"
                    onSubmitEditing={handleSave}
                    maxLength={60}
                  />
                )}
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.four,
  },
  title: { fontWeight: '600' },
  body: { paddingTop: Spacing.two, alignItems: 'center' },
  field: { width: '100%', maxWidth: 500 },
  input: {
    height: 44,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  smartToggle: {
    marginTop: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  smartToggleLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  smartHint: { marginTop: Spacing.two, paddingHorizontal: Spacing.one },
  ruleGroup: { marginTop: Spacing.three, borderRadius: 10, overflow: 'hidden' },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  keywordInput: { marginTop: Spacing.three },
});
