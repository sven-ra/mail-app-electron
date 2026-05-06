import React from 'react';
import styles from './InboxPanel.module.css';

function InboxPanel({ emails, onSelectEmail }) {
  return (
    <section className={styles.inboxSection}>
      <h2>Inbox</h2>
      <ul className={styles.list}>
        {emails.map((email, index) => (
          <li
            key={index}
            className={styles.item}
            onClick={() => onSelectEmail(email)}
          >
            {email.date} - {email.subject}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default InboxPanel;
