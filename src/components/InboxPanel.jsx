import React from 'react';
import styles from './InboxPanel.module.css';

function InboxPanel({ title, emails, onSelectEmail }) {
  return (
    <section className={styles.inboxSection}>
      <h2>{title}</h2>
      <ul className={styles.list}>
        {emails.map((email) => (
          <li
            key={email.uid || `${email.date}-${email.subject}`}
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
