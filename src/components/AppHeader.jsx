import React from 'react';
import styles from './AppHeader.module.css';

function AppHeader({ loggedIn, currentPage, onOpenInbox, onOpenSettings, onLogout }) {
  return (
    <header className={styles.header}>
      {loggedIn && (
        <>
          <button
            type="button"
            className={`${styles.navButton} ${currentPage === 'inbox' ? styles.navButtonActive : ''}`}
            onClick={onOpenInbox}
          >
            Inbox
          </button>
          <button
            type="button"
            className={`${styles.navButton} ${currentPage === 'settings' ? styles.navButtonActive : ''}`}
            onClick={onOpenSettings}
          >
            Settings
          </button>
          <button type="button" className={styles.logoutButton} onClick={onLogout}>
            Logout
          </button>
        </>
      )}
    </header>
  );
}

export default AppHeader;
