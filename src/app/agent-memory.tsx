import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, Button } from '@/components/ui';
import { colors, spacing, type } from '@/components/theme';
import {
  fetchAgentMemories,
  forgetAgentMemory,
  type AgentMemory,
} from '@/services/agentLink';
import { confirmAction } from '@/services/confirm';
import { showToast } from '@/store/toastStore';

export default function AgentMemoryScreen() {
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMemories(await fetchAgentMemories());
    } catch {
      showToast("Couldn't load Oliv's memory");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const forget = async (memory: AgentMemory) => {
    const confirmed = await confirmAction({
      title: 'Forget this?',
      message: memory.value,
      confirmLabel: 'Forget',
      destructive: true,
    });
    if (!confirmed) return;
    setBusyKey(memory.key);
    try {
      await forgetAgentMemory(memory.key);
      setMemories((current) => current.filter((candidate) => candidate.key !== memory.key));
      showToast('Oliv forgot that');
    } catch {
      showToast("Couldn't remove that memory");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={{ gap: spacing(1) }}>
        <Text style={type.title}>What Oliv remembers</Text>
        <Text style={type.small}>
          Oliv only saves durable preferences you explicitly share. Remove anything here, or text “forget that.”
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.olive} />
      ) : memories.length === 0 ? (
        <EmptyState
          icon="bookmark"
          title="No saved preferences"
          body="Tell Oliv something useful, like “I’m vegetarian” or “keep your feedback direct.”"
        />
      ) : (
        memories.map((memory) => (
          <Card key={memory.key} style={styles.memory}>
            <View style={{ flex: 1, gap: spacing(1) }}>
              <Text style={type.bodyBold}>{memory.value}</Text>
              <Text style={type.tiny}>
                {memory.key.replace(/_/g, ' ')} · updated {new Date(memory.updatedAt).toLocaleDateString()}
              </Text>
            </View>
            <Button
              title="Forget"
              variant="ghost"
              loading={busyKey === memory.key}
              onPress={() => void forget(memory)}
            />
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    padding: spacing(4),
    gap: spacing(4),
    paddingBottom: spacing(12),
  },
  memory: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
});
