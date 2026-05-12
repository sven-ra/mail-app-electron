import React from 'react';
import styles from './styles.module.css';

export type DebugPanelProps = {
  open: boolean;
  saveDisabled: boolean;
  savePending: boolean;
  onSaveCurrentEmailRaw: () => void;
};

function DebugPanel({ open, saveDisabled, savePending, onSaveCurrentEmailRaw }: DebugPanelProps): React.ReactElement | null {
  if (!open) return null;

  return (
    <aside className={styles.panel}>
      <button
        type="button"
        className={styles.button}
        disabled={saveDisabled || savePending}
        onClick={onSaveCurrentEmailRaw}
      >
        save current email raw data
      </button>
    </aside>
  );
}

export default DebugPanel;
