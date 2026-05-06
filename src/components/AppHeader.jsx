import React from 'react';
import styles from './AppHeader.module.css';

function AppHeader({ loggedIn, onLogout }) {
  return (
    <header className={styles.header}>
      <h1>Email Viewer</h1>
      {loggedIn && (
        <button className={styles.logoutButton} onClick={onLogout}>
          Logout
        </button>
      )}
    </header>
  );
}

export default AppHeader;
