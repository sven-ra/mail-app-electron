import React, { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Button from '../button';
import TextInput from '../text-input';
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
  composeDockFocused?: boolean;
  onEscapeFromEditor?: () => void;
};

function normalizeLinkUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

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
  composeDockFocused = false,
  onEscapeFromEditor,
}: ReplyEditorDockProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editorInstanceRef = useRef<{ getHTML(): string; getText(): string } | null>(null);
  const sendDisabledRef = useRef(sendDisabled);
  const onSendRef = useRef(onSend);
  const onEscapeFromEditorRef = useRef(onEscapeFromEditor);

  sendDisabledRef.current = sendDisabled;
  onSendRef.current = onSend;
  onEscapeFromEditorRef.current = onEscapeFromEditor;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          defaultProtocol: 'https',
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
      handleKeyDown: (_view, event) => {
        if (event.key === 'Escape') {
          onEscapeFromEditorRef.current?.();
          return true;
        }
        if (
          !event.metaKey ||
          !event.shiftKey ||
          (event.key !== 'd' && event.key !== 'D')
        ) {
          return false;
        }
        const ed = editorInstanceRef.current;
        if (!ed || sendDisabledRef.current) return false;
        event.preventDefault();
        onSendRef.current({
          html: ed.getHTML(),
          text: ed.getText(),
        });
        return true;
      },
    },
  });

  useEffect(() => {
    editorInstanceRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(initialBodyHtml || '<p></p>');
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

    editor.chain().focus().extendMarkRange('link').setLink({ href: normalizeLinkUrl(normalizedUrl) }).run();
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
    <div
      className={`${styles.editorDock} ${composeDockFocused ? styles.editorDockFocused : ''}`}
      data-mail-compose-dock
    >
      <div className={styles.composeHeader}>
        <label className={styles.composeField}>
          <span>To:</span>
          <TextInput value={composeTo} onChange={(e) => onComposeChange('to', e.target.value)} />
        </label>
        <label className={styles.composeField}>
          <span>Cc:</span>
          <TextInput value={composeCc} onChange={(e) => onComposeChange('cc', e.target.value)} />
        </label>
        <label className={styles.composeField}>
          <span>Subject:</span>
          <TextInput
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
              <Button onClick={() => onRemoveAttachment(item.id)}>Remove</Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={styles.editorMessage}>

        <div className={styles.editorToolbar}>
          <input
            ref={fileInputRef}
            type="file"
            className={styles.fileInputHidden}
            multiple
            onChange={handleFileInputChange}
          />
          <Button onClick={() => fileInputRef.current?.click()} disabled={!editor}>
            Attach
          </Button>
          <Button
            className={editor?.isActive('bold') ? styles.toolbarButtonActive : ''}
            onClick={() => editor?.chain().focus().toggleBold().run()}
            disabled={!editor}
          >
            Bold
          </Button>
          <Button
            className={editor?.isActive('italic') ? styles.toolbarButtonActive : ''}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            disabled={!editor}
          >
            Italic
          </Button>
          <Button
            className={editor?.isActive('underline') ? styles.toolbarButtonActive : ''}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            disabled={!editor}
          >
            Underline
          </Button>
          <Button
            className={editor?.isActive('strike') ? styles.toolbarButtonActive : ''}
            onClick={() => editor?.chain().focus().toggleStrike().run()}
            disabled={!editor}
          >
            Strike
          </Button>
          <Button
            className={editor?.isActive('bulletList') ? styles.toolbarButtonActive : ''}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            disabled={!editor}
          >
            Bullet List
          </Button>
          <Button
            className={editor?.isActive('orderedList') ? styles.toolbarButtonActive : ''}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            disabled={!editor}
          >
            Numbered List
          </Button>
          <Button
            className={editor?.isActive('link') ? styles.toolbarButtonActive : ''}
            onClick={handleSetLink}
            disabled={!editor}
          >
            Link
          </Button>
          <Button
            onClick={() => editor?.chain().focus().extendMarkRange('link').unsetLink().run()}
            disabled={!editor || !editor.isActive('link')}
          >
            Unlink
          </Button>
        </div>
        <div className={styles.editorContent} data-mail-compose-editor>
          <EditorContent editor={editor} />
        </div>
        <Button
          className={styles.sendButton}
          onClick={handleSendClick}
          size="lg"
          disabled={!editor || sendDisabled}
        >
          Send
        </Button>
      </div>
    </div>
  );
}

export default ReplyEditorDock;
