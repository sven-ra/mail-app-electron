import React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { getAddressForActions, getSenderDisplayName } from '../../mail/plaintextThread';
import styles from './styles.module.css';

type SenderDropdownProps = {
  label: string;
};

function SenderDropdown({ label }: SenderDropdownProps) {
  const address = getAddressForActions(label);
  const displayName = getSenderDisplayName(label);

  async function handleCopyAddress() {
    if (!address) {
      return;
    }

    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(address);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = address;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  function handleSendMail() {
    // Placeholder action until send-email flow is implemented.
  }

  return (
    <div className={styles.messageSender}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className={styles.messageSenderButton}>
            {displayName}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={styles.senderMenuContent} sideOffset={4} align="start">
            <DropdownMenu.Label className={styles.senderMenuLabel}>{address || label}</DropdownMenu.Label>
            <DropdownMenu.Item className={styles.senderMenuItem} onSelect={handleCopyAddress}>
              Copy address
            </DropdownMenu.Item>
            <DropdownMenu.Item className={styles.senderMenuItem} onSelect={handleSendMail}>
              Send mail
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

export default SenderDropdown;
