import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { FOLDERS_PANEL_WIDTH_STORAGE_KEY, INBOX_WIDTH_STORAGE_KEY } from '../mail/constants';

export function useInboxResize() {
  const DEFAULT_FOLDERS_WIDTH = 220;
  const RESIZER_WIDTH = 6;
  const MAIN_LAYOUT_GAP = 16;
  const MIN_FOLDERS_WIDTH = 160;
  const MIN_INBOX_WIDTH = 240;
  const MIN_CONTENT_WIDTH = 320;

  const [foldersWidth, setFoldersWidth] = useState<number>(() => {
    const value = Number(localStorage.getItem(FOLDERS_PANEL_WIDTH_STORAGE_KEY));
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
    return DEFAULT_FOLDERS_WIDTH;
  });
  const [inboxWidth, setInboxWidth] = useState<number>(() => {
    const value = Number(localStorage.getItem(INBOX_WIDTH_STORAGE_KEY));
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
    return 420;
  });
  const [isResizingFolders, setIsResizingFolders] = useState(false);
  const [isResizingInbox, setIsResizingInbox] = useState(false);

  const foldersResizeCleanupRef = useRef<(() => void) | null>(null);
  const foldersResizeStartXRef = useRef(0);
  const foldersResizeStartWidthRef = useRef(0);
  const foldersResizeMaxWidthRef = useRef(0);

  const inboxResizeCleanupRef = useRef<(() => void) | null>(null);
  const inboxResizeStartXRef = useRef(0);
  const inboxResizeStartWidthRef = useRef(0);
  const inboxResizeMaxWidthRef = useRef(0);

  useEffect(
    () => () => {
      foldersResizeCleanupRef.current?.();
      inboxResizeCleanupRef.current?.();
    },
    []
  );

  useEffect(() => {
    localStorage.setItem(FOLDERS_PANEL_WIDTH_STORAGE_KEY, String(foldersWidth));
  }, [foldersWidth]);

  useEffect(() => {
    localStorage.setItem(INBOX_WIDTH_STORAGE_KEY, String(inboxWidth));
  }, [inboxWidth]);

  function handleStartFoldersResize(event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    const handle = event.currentTarget;
    const layout = handle.closest('main');
    if (!layout) return;

    const maxFoldersWidth = Math.max(
      MIN_FOLDERS_WIDTH,
      layout.clientWidth -
        MIN_INBOX_WIDTH -
        RESIZER_WIDTH * 2 -
        MIN_CONTENT_WIDTH -
        MAIN_LAYOUT_GAP * 3
    );
    foldersResizeStartXRef.current = event.clientX;
    foldersResizeStartWidthRef.current = foldersWidth;
    foldersResizeMaxWidthRef.current = maxFoldersWidth;
    setIsResizingFolders(true);

    function handlePointerMove(moveEvent: PointerEvent) {
      const deltaX = moveEvent.clientX - foldersResizeStartXRef.current;
      const nextWidth = Math.min(
        foldersResizeMaxWidthRef.current,
        Math.max(MIN_FOLDERS_WIDTH, foldersResizeStartWidthRef.current + deltaX)
      );
      setFoldersWidth(nextWidth);
    }

    function handlePointerUp() {
      setIsResizingFolders(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      foldersResizeCleanupRef.current = null;
    }

    handle.setPointerCapture(event.pointerId);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    foldersResizeCleanupRef.current = handlePointerUp;
  }

  function handleStartInboxResize(event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    const handle = event.currentTarget;
    const layout = handle.closest('main');
    if (!layout) return;

    const maxInboxWidth = Math.max(
      MIN_INBOX_WIDTH,
      layout.clientWidth -
        foldersWidth -
        RESIZER_WIDTH * 2 -
        MIN_CONTENT_WIDTH -
        MAIN_LAYOUT_GAP * 3
    );
    inboxResizeStartXRef.current = event.clientX;
    inboxResizeStartWidthRef.current = inboxWidth;
    inboxResizeMaxWidthRef.current = maxInboxWidth;
    setIsResizingInbox(true);

    function handlePointerMove(moveEvent: PointerEvent) {
      const deltaX = moveEvent.clientX - inboxResizeStartXRef.current;
      const nextWidth = Math.min(
        inboxResizeMaxWidthRef.current,
        Math.max(MIN_INBOX_WIDTH, inboxResizeStartWidthRef.current + deltaX)
      );
      setInboxWidth(nextWidth);
    }

    function handlePointerUp() {
      setIsResizingInbox(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      inboxResizeCleanupRef.current = null;
    }

    handle.setPointerCapture(event.pointerId);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    inboxResizeCleanupRef.current = handlePointerUp;
  }

  return {
    inboxWidth,
    isResizingInbox,
    isResizingFolders,
    isResizingColumns: isResizingInbox || isResizingFolders,
    handleStartFoldersResize,
    handleStartInboxResize,
    layoutColumnStyle: {
      gridTemplateColumns: `${foldersWidth}px ${RESIZER_WIDTH}px ${inboxWidth}px ${RESIZER_WIDTH}px minmax(0, 1fr)`,
    },
  };
}
