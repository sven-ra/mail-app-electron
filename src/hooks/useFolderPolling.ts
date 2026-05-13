import { useEffect, useRef } from 'react';
import type { MailboxConfig } from '../types/mail';

const MAILBOX_POLL_INTERVAL_MS = 30_000;

type UseFolderPollingArgs = {
  enabled: boolean;
  selectedMailboxId: string | null;
  selectedFolder: string | null;
  mailboxes: MailboxConfig[];
  onPoll: () => Promise<void>;
  onError: (error: Error) => void;
};

export function useFolderPolling({
  enabled,
  selectedMailboxId,
  selectedFolder,
  mailboxes,
  onPoll,
  onError,
}: UseFolderPollingArgs): void {
  const onPollRef = useRef(onPoll);
  const onErrorRef = useRef(onError);
  const isPollingRef = useRef(false);

  useEffect(() => {
    onPollRef.current = onPoll;
    onErrorRef.current = onError;
  }, [onPoll, onError]);

  useEffect(() => {
    if (!enabled || !selectedMailboxId || !selectedFolder || !mailboxes.length) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      if (isPollingRef.current) return;
      isPollingRef.current = true;

      onPollRef
        .current()
        .catch((error) => {
          onErrorRef.current(error);
        })
        .finally(() => {
          isPollingRef.current = false;
        });
    }, MAILBOX_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, selectedMailboxId, selectedFolder, mailboxes]);
}
