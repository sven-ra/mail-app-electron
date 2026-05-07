import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { INBOX_WIDTH_STORAGE_KEY } from '../mail/constants';

export function useInboxResize() {
  const FOLDERS_WIDTH = 220;
  const RESIZER_WIDTH = 12;
  const MAIN_LAYOUT_GAP = 16;
  const MIN_INBOX_WIDTH = 240;
  const MIN_CONTENT_WIDTH = 320;

  const [inboxWidth, setInboxWidth] = useState<number>(() => {
    const value = Number(localStorage.getItem(INBOX_WIDTH_STORAGE_KEY));
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
    return 420;
  });
  const [isResizingInbox, setIsResizingInbox] = useState(false);

  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);
  const resizeMaxWidthRef = useRef(0);

  useEffect(
    () => () => {
      if (resizeCleanupRef.current) {
        resizeCleanupRef.current();
      }
    },
    []
  );

  useEffect(() => {
    localStorage.setItem(INBOX_WIDTH_STORAGE_KEY, String(inboxWidth));
  }, [inboxWidth]);

  function handleStartInboxResize(event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    const handle = event.currentTarget;
    const layout = handle.closest('main');
    if (!layout) return;

    const maxInboxWidth = Math.max(
      MIN_INBOX_WIDTH,
      layout.clientWidth -
        FOLDERS_WIDTH -
        RESIZER_WIDTH -
        MIN_CONTENT_WIDTH -
        MAIN_LAYOUT_GAP * 3
    );
    resizeStartXRef.current = event.clientX;
    resizeStartWidthRef.current = inboxWidth;
    resizeMaxWidthRef.current = maxInboxWidth;
    setIsResizingInbox(true);

    function handlePointerMove(moveEvent: PointerEvent) {
      const deltaX = moveEvent.clientX - resizeStartXRef.current;
      const nextWidth = Math.min(
        resizeMaxWidthRef.current,
        Math.max(MIN_INBOX_WIDTH, resizeStartWidthRef.current + deltaX)
      );
      setInboxWidth(nextWidth);
    }

    function handlePointerUp() {
      setIsResizingInbox(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      resizeCleanupRef.current = null;
    }

    handle.setPointerCapture(event.pointerId);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    resizeCleanupRef.current = handlePointerUp;
  }

  return {
    inboxWidth,
    isResizingInbox,
    handleStartInboxResize,
    layoutColumnStyle: {
      gridTemplateColumns: `${FOLDERS_WIDTH}px ${inboxWidth}px ${RESIZER_WIDTH}px minmax(0, 1fr)`,
    },
  };
}
