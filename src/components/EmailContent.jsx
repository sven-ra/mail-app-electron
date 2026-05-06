import React from 'react';
import styles from './EmailContent.module.css';

function EmailContent({ email }) {
  if (!email) return <div>Click an email to view content.</div>;
  if (email.loading) return <div>Loading email...</div>;
  if (email.error) return <div>{email.error}</div>;

  return (
    <article className={styles.content}>
      <h3>{email.subject}</h3>
      <div className={styles.meta}>
        <b>From:</b> {escapeHtml(email.from)}
        <br />
        <b>To:</b> {escapeHtml(email.to)}
        <br />
        <b>Date:</b> {escapeHtml(email.date)}
        <br />
        <hr />
      </div>
      <pre className={styles.body}>{email.text || '(no plain text body)'}</pre>
    </article>
  );
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

export default EmailContent;
