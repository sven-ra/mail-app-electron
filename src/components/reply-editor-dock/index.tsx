import React, { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import styles from './styles.module.css';

function ReplyEditorDock() {
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

  return (
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
  );
}

export default ReplyEditorDock;
