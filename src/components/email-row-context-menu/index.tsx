import React from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import styles from './styles.module.css';

type EmailRowContextMenuProps = {
  children: React.ReactNode;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onMarkAsUnread: () => void;
  onMoveToJunk: () => void;
  onDelete: () => void;
  onArchive: () => void;
};

function EmailRowContextMenu({
  children,
  onReply,
  onReplyAll,
  onForward,
  onMarkAsUnread,
  onMoveToJunk,
  onDelete,
  onArchive,
}: EmailRowContextMenuProps) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={styles.menuContent}>
          <ContextMenu.Item className={styles.menuItem} onSelect={onReply}>
            Reply
          </ContextMenu.Item>
          <ContextMenu.Item className={styles.menuItem} onSelect={onReplyAll}>
            Reply all
          </ContextMenu.Item>
          <ContextMenu.Item className={styles.menuItem} onSelect={onForward}>
            Forward
          </ContextMenu.Item>
          <ContextMenu.Separator className={styles.menuSeparator} />
          <ContextMenu.Item className={styles.menuItem} onSelect={onMarkAsUnread}>
            Mark as unread
          </ContextMenu.Item>
          <ContextMenu.Item className={styles.menuItem} onSelect={onMoveToJunk}>
            Move to junk
          </ContextMenu.Item>
          <ContextMenu.Separator className={styles.menuSeparator} />
          <ContextMenu.Item className={styles.menuItem} onSelect={onDelete}>
            Delete
          </ContextMenu.Item>
          <ContextMenu.Item className={styles.menuItem} onSelect={onArchive}>
            Archive
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export default EmailRowContextMenu;
