import { useEffect, useRef } from 'react';
import type { MailboxConfig } from '../types/mail';

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

  useEffect(() => {
    onPollRef.current = onPoll;
    onErrorRef.current = onError;
  }, [onPoll, onError]);

  useEffect(() => {
    if (!enabled || !selectedMailboxId || !selectedFolder) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      onPollRef.current().catch((error) => {
        onErrorRef.current(error);
      });
    }, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, selectedMailboxId, selectedFolder, mailboxes]);
}
