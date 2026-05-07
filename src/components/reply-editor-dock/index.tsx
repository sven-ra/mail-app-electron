import React, { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import styles from './styles.module.css';

function ReplyEditorDock() {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
        },
      }),
    ],
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
      </div>
      <div className={styles.editorContent}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export default ReplyEditorDock;
