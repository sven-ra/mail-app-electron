import React from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import LoginForm from '../login-form';
import styles from './styles.module.css';
import type { MailboxConfig } from '../../types/mail';

type SettingsScreenProps = {
  config: MailboxConfig;
  onConfigChange: (field: keyof MailboxConfig, value: string) => void;
  onAddMailbox: () => void;
  onCloseSettings: () => void;
  mailboxes: MailboxConfig[];
  selectedSettingsMailboxId: string | null;
  onSelectSettingsMailbox: (mailbox: MailboxConfig) => void;
  onRemoveMailbox: (mailboxId: string) => void;
};

function SettingsScreen({
  config,
  onConfigChange,
  onAddMailbox,
  onCloseSettings,
  mailboxes,
  selectedSettingsMailboxId,
  onSelectSettingsMailbox,
  onRemoveMailbox,
}: SettingsScreenProps) {
  return (
    <main className={styles.settingsLayout}>
      <section className={styles.settingsSection}>
        <button type="button" className={styles.settingsCloseButton} onClick={onCloseSettings}>
          Close settings
        </button>
        <h2>Add mailbox</h2>
        <LoginForm config={config} onConfigChange={onConfigChange} onConnect={onAddMailbox} />
      </section>
      <section className={styles.mailboxSection}>
        <h2>Mailboxes</h2>
        <ul className={styles.mailboxList}>
          {mailboxes.map((mailbox) => (
            <li
              key={mailbox.id}
              className={`${styles.mailboxListItem} ${
                selectedSettingsMailboxId === mailbox.id ? styles.mailboxListItemActive : ''
              }`}
            >
              <button
                type="button"
                className={styles.mailboxSelectButton}
                onClick={() => onSelectSettingsMailbox(mailbox)}
              >
                {mailbox.username}
              </button>
              <AlertDialog.Root>
                <AlertDialog.Trigger asChild>
                  <button type="button" className={styles.removeInboxButton}>
                    Remove inbox
                  </button>
                </AlertDialog.Trigger>
                <AlertDialog.Portal>
                  <AlertDialog.Overlay className={styles.alertDialogOverlay} />
                  <AlertDialog.Content className={styles.alertDialogContent}>
                    <AlertDialog.Title className={styles.alertDialogTitle}>
                      Remove inbox?
                    </AlertDialog.Title>
                    <AlertDialog.Description className={styles.alertDialogDescription}>
                      {mailbox.username}
                    </AlertDialog.Description>
                    <div className={styles.alertDialogActions}>
                      <AlertDialog.Cancel asChild>
                        <button type="button" className={styles.alertDialogCancelButton}>
                          Cancel
                        </button>
                      </AlertDialog.Cancel>
                      <AlertDialog.Action asChild>
                        <button
                          type="button"
                          className={styles.alertDialogActionButton}
                          onClick={() => onRemoveMailbox(mailbox.id)}
                        >
                          Remove
                        </button>
                      </AlertDialog.Action>
                    </div>
                  </AlertDialog.Content>
                </AlertDialog.Portal>
              </AlertDialog.Root>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

export default SettingsScreen;
