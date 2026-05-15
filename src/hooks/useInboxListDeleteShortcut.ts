import { useEvent } from 'react-use';
import { findEmailBySelectionUid } from '../mail/inboxListNavigation';
import { isDeleteSelectedItemShortcut, targetIsEditableField } from '../mail/keyboard';
import type { EmailListItem, ThreadGroup } from '../types/mail';

type UseInboxListDeleteShortcutOptions = {
  enabled: boolean;
  threadGroups: readonly ThreadGroup[];
  selectedEmailUid: string | null;
  onDeleteEmail: (email: EmailListItem) => void;
};

export function useInboxListDeleteShortcut({
  enabled,
  threadGroups,
  selectedEmailUid,
  onDeleteEmail,
}: UseInboxListDeleteShortcutOptions): void {
  useEvent('keydown', (event) => {
    if (!enabled || !isDeleteSelectedItemShortcut(event)) return;
    if (targetIsEditableField(event.target)) return;
    if (!selectedEmailUid) return;

    const email = findEmailBySelectionUid(threadGroups, selectedEmailUid);
    if (!email) return;

    event.preventDefault();
    void onDeleteEmail(email);
  });
}
