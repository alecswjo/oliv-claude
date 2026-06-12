import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { relativeLabel } from '@/domain/dates';
import type { Comment, UserProfile } from '@/domain/types';
import { Icon } from './Icon';
import { Button, Field, PressableScale } from './ui';
import { UserAvatar } from './UserAvatar';
import { colors, spacing, type } from './theme';

/** Comments — spec §F4.5. Deletion rules enforced by the caller via canDelete. */
export function CommentList({
  comments,
  resolveUser,
  canDelete,
  onDelete,
  onReport,
  onSubmit,
  now = new Date(),
}: {
  comments: Comment[];
  resolveUser: (userId: string) => UserProfile | undefined;
  canDelete: (comment: Comment) => boolean;
  onDelete: (commentId: string) => void;
  /** Report someone else's comment (UGC safety); shown when delete isn't. */
  onReport?: (comment: Comment) => void;
  onSubmit: (text: string) => void;
  now?: Date;
}) {
  const [draft, setDraft] = useState('');

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onSubmit(text.slice(0, 280));
    setDraft('');
  };

  return (
    <View style={{ gap: spacing(3) }}>
      {comments.length === 0 ? (
        <Text style={type.small}>No comments yet — say something nice.</Text>
      ) : (
        comments.map((comment) => {
          const author = resolveUser(comment.userId);
          return (
            <View key={comment.id} style={styles.comment}>
              <UserAvatar emoji={author?.avatarEmoji ?? '🙂'} color={author?.avatarColor ?? colors.olive} size={32} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.commentHeader}>
                  <Text style={type.smallBold}>{author?.displayName ?? 'Someone'}</Text>
                  <Text style={type.tiny}>{relativeLabel(comment.createdAt, now)}</Text>
                </View>
                <Text style={type.body}>{comment.text}</Text>
              </View>
              {canDelete(comment) ? (
                <PressableScale accessibilityRole="button" accessibilityLabel="Delete comment" hitSlop={10} onPress={() => onDelete(comment.id)}>
                  <Icon name="x" size={16} color={colors.ink30} />
                </PressableScale>
              ) : onReport ? (
                <PressableScale accessibilityRole="button" accessibilityLabel="Report comment" hitSlop={10} onPress={() => onReport(comment)}>
                  <Icon name="flag" size={14} color={colors.ink30} />
                </PressableScale>
              ) : null}
            </View>
          );
        })
      )}

      <View style={styles.inputRow}>
        <View style={{ flex: 1 }}>
          <Field
            placeholder="Add a comment…"
            value={draft}
            onChangeText={setDraft}
            maxLength={280}
            onSubmitEditing={submit}
            returnKeyType="send"
          />
        </View>
        <Button title="Post" onPress={submit} disabled={draft.trim().length === 0} style={styles.postButton} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  comment: { flexDirection: 'row', gap: spacing(2.5), alignItems: 'flex-start' },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  inputRow: { flexDirection: 'row', gap: spacing(2), alignItems: 'flex-end' },
  postButton: { minHeight: 50 },
});
