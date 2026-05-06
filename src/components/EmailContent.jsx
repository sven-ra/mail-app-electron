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
      <div className={styles.body}>
        {renderThreadedBody(email.text || '(no plain text body)')}
      </div>
    </article>
  );
}

function renderThreadedBody(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line, index) => {
      const { depth, content } = extractQuoteDepth(line);
      const className = `${styles.bodyLine} ${depth > 0 ? styles.bodyLineQuoted : ''}`.trim();
      return (
        <div
          key={`${index}-${depth}`}
          className={className}
          style={{ '--quote-depth': depth }}
        >
          {content}
        </div>
      );
    });
}

function extractQuoteDepth(line) {
  const value = String(line || '');
  let index = 0;

  while (value[index] === ' ') {
    index += 1;
  }

  let depth = 0;
  while (value[index] === '>') {
    depth += 1;
    index += 1;
    while (value[index] === ' ') {
      index += 1;
    }
  }

  return { depth, content: value.slice(index) };
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

export default EmailContent;
