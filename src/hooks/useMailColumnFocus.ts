import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useEvent } from 'react-use';
import {
  focusComposeEditor,
  isFocusInComposeEditor,
  isHorizontalNavigationKey,
  MAIL_COLUMNS,
  shouldIgnoreColumnShortcut,
  type MailColumn,
} from '../mail/keyboard';

const DEFAULT_COLUMN: MailColumn = 'list';

export type { MailColumn };

type UseMailColumnFocusOptions = {
  onComposeEditorFocused?: () => void;
};

export function useMailColumnFocus(
  enabled: boolean,
  { onComposeEditorFocused }: UseMailColumnFocusOptions = {}
) {
  const [focusedColumn, setFocusedColumn] = useState<MailColumn>(DEFAULT_COLUMN);
  const focusedColumnRef = useRef<MailColumn>(DEFAULT_COLUMN);
  const foldersRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const refByColumn: Record<MailColumn, RefObject<HTMLDivElement>> = {
    folders: foldersRef,
    list: listRef,
    content: contentRef,
  };

  focusedColumnRef.current = focusedColumn;

  const selectColumn = useCallback((column: MailColumn, options?: { focusDom?: boolean }) => {
    setFocusedColumn(column);
    if (options?.focusDom !== false) {
      refByColumn[column].current?.focus();
    }
  }, []);

  const focusColumn = useCallback((column: MailColumn) => {
    selectColumn(column);
  }, [selectColumn]);

  useEffect(() => {
    if (!enabled) return;
    focusColumn(DEFAULT_COLUMN);
  }, [enabled, focusColumn]);

  useEvent('keydown', (event) => {
    if (!enabled || !isHorizontalNavigationKey(event.key)) return;
    if (shouldIgnoreColumnShortcut(event)) return;

    const currentColumn = focusedColumnRef.current;
    const currentIndex = MAIL_COLUMNS.indexOf(currentColumn);

    if (event.key === 'ArrowRight' && currentColumn === 'content') {
      const contentRoot = contentRef.current;
      const active = document.activeElement;
      if (
        contentRoot &&
        active instanceof HTMLElement &&
        !isFocusInComposeEditor(contentRoot, active) &&
        focusComposeEditor(contentRoot)
      ) {
        onComposeEditorFocused?.();
        event.preventDefault();
        return;
      }
    }

    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const nextColumn = MAIL_COLUMNS[currentIndex + delta];
    if (!nextColumn) return;

    event.preventDefault();
    focusColumn(nextColumn);
  });

  const getColumnProps = useCallback(
    (column: MailColumn) => ({
      ref: refByColumn[column],
      tabIndex: -1 as const,
      'data-mail-column': column,
      'data-mail-column-active': focusedColumn === column ? ('true' as const) : ('false' as const),
      onFocusCapture: () => setFocusedColumn(column),
    }),
    [focusedColumn]
  );

  return {
    focusedColumn,
    focusColumn,
    selectColumn,
    getColumnProps,
    contentRef,
  };
}
