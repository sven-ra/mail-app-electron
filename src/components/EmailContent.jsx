import React, { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import styles from './EmailContent.module.css';

function EmailContent({ email }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: '',
    editable: true,
    editorProps: {
      attributes: {
        class: styles.proseMirrorEditable,
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.commands.focus('end');
  }, [editor]);

  if (!email) return <div>Click an email to view content.</div>;
  if (email.loading) return <div>Loading email...</div>;
  if (email.error) return <div>{email.error}</div>;
  const htmlBody = getHtmlBody(email.html);
  const hasHtmlBody = Boolean(htmlBody);

  return (
    <article className={styles.content}>
      <h3>{email.subject}</h3>
      <div className={styles.meta}>
        <b>From:</b> {formatHeaderValue(email.from)}
        <br />
        <b>To:</b> {formatHeaderValue(email.to)}
        <br />
        <b>Date:</b> {formatHeaderValue(email.date)}
        <br />
        <hr />
      </div>
      <div className={styles.messageArea}>
        {hasHtmlBody ? (
          <iframe
            className={styles.htmlFrame}
            title="Email HTML content"
            sandbox=""
            srcDoc={htmlBody}
          />
        ) : (
          <div className={styles.body}>
            {renderThreadedBody(email.text || '(no plain text body)')}
          </div>
        )}
      </div>
      <div className={styles.editorDock}>
        <div className={styles.editorToolbar}>
          <button
            type="button"
            className={`${styles.toolbarButton} ${editor?.isActive('bold') ? styles.toolbarButtonActive : ''}`}
            onClick={() => editor?.chain().focus().toggleBold().run()}
            disabled={!editor}
          >
            Bold
          </button>
          <button
            type="button"
            className={`${styles.toolbarButton} ${editor?.isActive('italic') ? styles.toolbarButtonActive : ''}`}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            disabled={!editor}
          >
            Italic
          </button>
          <button
            type="button"
            className={`${styles.toolbarButton} ${editor?.isActive('strike') ? styles.toolbarButtonActive : ''}`}
            onClick={() => editor?.chain().focus().toggleStrike().run()}
            disabled={!editor}
          >
            Strike
          </button>
          <button
            type="button"
            className={`${styles.toolbarButton} ${editor?.isActive('bulletList') ? styles.toolbarButtonActive : ''}`}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            disabled={!editor}
          >
            Bullet List
          </button>
          <button
            type="button"
            className={`${styles.toolbarButton} ${editor?.isActive('orderedList') ? styles.toolbarButtonActive : ''}`}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            disabled={!editor}
          >
            Numbered List
          </button>
        </div>
        <div
          className={styles.editorContent}
          onMouseDown={(event) => {
            event.preventDefault();
            editor?.chain().focus().run();
          }}
        >
          <EditorContent editor={editor} />
        </div>
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

function formatHeaderValue(text) {
  const value = String(text || '');
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

function getHtmlBody(html) {
  if (typeof html === 'string') {
    return html.trim();
  }
  if (html == null) {
    return '';
  }
  return String(html).trim();
}

export default EmailContent;
