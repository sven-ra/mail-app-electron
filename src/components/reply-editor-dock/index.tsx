import React, { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import styles from './styles.module.css';

export type ComposeField = 'to' | 'cc' | 'subject';

export type ReplyEditorDockProps = {
  composeTo: string;
  composeCc: string;
  composeSubject: string;
  onComposeChange: (field: ComposeField, value: string) => void;
  bodyResetKey: number;
  initialBodyHtml: string;
  onSend: (body: { html: string; text: string }) => void;
  attachmentItems: { id: string; name: string }[];
  onAddAttachments: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  sendDisabled?: boolean;
};

function ReplyEditorDock({
  composeTo,
  composeCc,
  composeSubject,
  onComposeChange,
  bodyResetKey,
  initialBodyHtml,
  onSend,
  attachmentItems,
  onAddAttachments,
  onRemoveAttachment,
  sendDisabled,
}: ReplyEditorDockProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
        },
      }),
      Underline,
    ],
    content: '<p></p>',
    editable: true,
    editorProps: {
      attributes: {
        class: styles.proseMirrorEditable,
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(initialBodyHtml || '<p></p>');
    editor.commands.focus('end');
  }, [editor, bodyResetKey, initialBodyHtml]);

  function handleSetLink() {
    if (!editor) return;

    const currentUrl = (editor.getAttributes('link').href as string | undefined) || '';
    const nextUrl = window.prompt('URL', currentUrl);
    if (nextUrl === null) return;

    const normalizedUrl = nextUrl.trim();
    if (!normalizedUrl) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: normalizedUrl }).run();
  }

  function handleSendClick() {
    if (!editor || sendDisabled) return;
    onSend({
      html: editor.getHTML(),
      text: editor.getText(),
    });
  }

  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const list = event.target.files;
    if (!list?.length) return;
    onAddAttachments(Array.from(list));
    event.target.value = '';
  }

  return (
    <div className={styles.editorDock}>
      <div className={styles.composeHeader}>
        <label className={styles.composeField}>
          <span>To:</span>
          <input
            type="text"
            value={composeTo}
            onChange={(e) => onComposeChange('to', e.target.value)}
          />
        </label>
        <label className={styles.composeField}>
          <span>Cc:</span>
          <input
            type="text"
            value={composeCc}
            onChange={(e) => onComposeChange('cc', e.target.value)}
          />
        </label>
        <label className={styles.composeField}>
          <span>Subject:</span>
          <input
            type="text"
            value={composeSubject}
            onChange={(e) => onComposeChange('subject', e.target.value)}
          />
        </label>
      </div>

      {attachmentItems.length > 0 ? (
        <ul className={styles.attachmentList}>
          {attachmentItems.map((item) => (
            <li key={item.id} className={styles.attachmentRow}>
              <span className={styles.attachmentName}>{item.name}</span>
              <button type="button" className={styles.toolbarButton} onClick={() => onRemoveAttachment(item.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={styles.editorToolbar}>
        <input
          ref={fileInputRef}
          type="file"
          className={styles.fileInputHidden}
          multiple
          onChange={handleFileInputChange}
        />
        <button
          type="button"
          className={styles.toolbarButton}
          onClick={() => fileInputRef.current?.click()}
          disabled={!editor}
        >
          Attach
        </button>
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
          className={`${styles.toolbarButton} ${editor?.isActive('underline') ? styles.toolbarButtonActive : ''}`}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          disabled={!editor}
        >
          Underline
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
        <button
          type="button"
          className={`${styles.toolbarButton} ${editor?.isActive('link') ? styles.toolbarButtonActive : ''}`}
          onClick={handleSetLink}
          disabled={!editor}
        >
          Link
        </button>
        <button
          type="button"
          className={styles.toolbarButton}
          onClick={() => editor?.chain().focus().extendMarkRange('link').unsetLink().run()}
          disabled={!editor || !editor.isActive('link')}
        >
          Unlink
        </button>
        <button type="button" className={styles.toolbarButton} onClick={handleSendClick} disabled={!editor || sendDisabled}>
          Send
        </button>
      </div>
      <div className={styles.editorContent}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export default ReplyEditorDock;
