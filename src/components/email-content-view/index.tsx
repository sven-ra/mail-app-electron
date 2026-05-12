import React, { useEffect, useMemo, useRef } from 'react';
import Button from '../button';
import styles from './styles.module.css';
import { prepareEmailHtml } from '../prepareEmailHtml';
import HtmlEmailFrame from '../html-email-frame';
import PlaintextThread from '../plaintext-thread';
import ReplyEditorDock from '../reply-editor-dock';
import {
  decodeHeaderValue,
  normalizeThreadOrder,
  parsePlaintextThread,
} from '../../mail/plaintextThread';
import type { LoadedEmailContent, MailboxConfig, SelectedEmailState } from '../../types/mail';

type EmailContentViewProps = {
  email: SelectedEmailState;
  mailbox: MailboxConfig | null;
  composeTo: string;
  composeCc: string;
  composeSubject: string;
  onComposeChange: (field: 'to' | 'cc' | 'subject', value: string) => void;
  composeBodyResetKey: number;
  composeInitialBodyHtml: string;
  onSend: (body: { html: string; text: string }) => void;
  attachmentItems: { id: string; name: string }[];
  onAddAttachments: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  sendDisabled?: boolean;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onArchive: () => void;
  onDelete: () => void;
};

function EmailContentView({
  email,
  mailbox,
  composeTo,
  composeCc,
  composeSubject,
  onComposeChange,
  composeBodyResetKey,
  composeInitialBodyHtml,
  onSend,
  attachmentItems,
  onAddAttachments,
  onRemoveAttachment,
  sendDisabled,
  onReply,
  onReplyAll,
  onForward,
  onArchive,
  onDelete,
}: EmailContentViewProps) {
  const messageAreaRef = useRef<HTMLDivElement | null>(null);

  const preparedHtml = useMemo(() => {
    if (!email || email.loading || email.error) return '';
    const contentEmail = email as LoadedEmailContent;
    return prepareEmailHtml(contentEmail.html, contentEmail.attachments);
  }, [email]);

  const threadSegments = useMemo(() => {
    if (!email || email.loading || email.error) return [];
    const contentEmail = email as LoadedEmailContent;
    return normalizeThreadOrder(parsePlaintextThread(contentEmail.text || ''));
  }, [email]);

  const showHtml = Boolean(preparedHtml) && threadSegments.length <= 1;

  useEffect(() => {
    const node = messageAreaRef.current;
    if (!node) return;
    if (!email || email.loading || email.error) return;
    if (showHtml) return;

    let active = true;
    const scrollToBottom = () => {
      if (!active) return;
      node.scrollTop = node.scrollHeight;
    };

    scrollToBottom();
    const raf = window.requestAnimationFrame(scrollToBottom);

    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => scrollToBottom());
      observer.observe(node);
      Array.from(node.children).forEach((child) => observer.observe(child));
    }

    const imageHandlers: Array<{ img: HTMLImageElement; handler: () => void }> = [];
    node.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
      if (img.complete) return;
      const handler = () => scrollToBottom();
      img.addEventListener('load', handler, { once: true });
      img.addEventListener('error', handler, { once: true });
      imageHandlers.push({ img, handler });
    });

    const stopTimeout = window.setTimeout(() => {
      active = false;
      if (observer) observer.disconnect();
    }, 1500);

    return () => {
      active = false;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(stopTimeout);
      if (observer) observer.disconnect();
      imageHandlers.forEach(({ img, handler }) => {
        img.removeEventListener('load', handler);
        img.removeEventListener('error', handler);
      });
    };
  }, [email, showHtml]);

  if (!email) return <div>Click an email to view content.</div>;
  if (email.loading) return <div>Loading email...</div>;
  if (email.error) return <div>{email.error}</div>;
  const contentEmail = email as LoadedEmailContent;

  const toolbarDisabled = !mailbox;
  const moveDisabled = toolbarDisabled || !contentEmail.uid || !contentEmail.folderKey;

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <Button onClick={onReply} disabled={toolbarDisabled}>
          Reply
        </Button>
        <Button onClick={onReplyAll} disabled={toolbarDisabled}>
          Reply to all
        </Button>
        <Button onClick={onForward} disabled={toolbarDisabled}>
          Forward
        </Button>
        <Button onClick={onArchive} disabled={moveDisabled}>
          Archive
        </Button>
        <Button onClick={onDelete} disabled={moveDisabled}>
          Delete
        </Button>
      </div>
      <div className={styles.subjectRow}>
        <h3>{contentEmail.subject}</h3>
      </div>
      <div className={styles.meta}>
        <b>From:</b> {decodeHeaderValue(contentEmail.from)}
        <br />
        <b>To:</b> {decodeHeaderValue(contentEmail.to)}
        <br />
        <b>Date:</b> {decodeHeaderValue(contentEmail.date)}
        <br />
        <hr />
      </div>
      <div className={styles.messageArea} ref={messageAreaRef}>
        {showHtml ? (
          <HtmlEmailFrame html={preparedHtml} />
        ) : (
          <PlaintextThread segments={threadSegments} email={contentEmail} />
        )}
      </div>
      <ReplyEditorDock
        composeTo={composeTo}
        composeCc={composeCc}
        composeSubject={composeSubject}
        onComposeChange={onComposeChange}
        bodyResetKey={composeBodyResetKey}
        initialBodyHtml={composeInitialBodyHtml}
        onSend={onSend}
        attachmentItems={attachmentItems}
        onAddAttachments={onAddAttachments}
        onRemoveAttachment={onRemoveAttachment}
        sendDisabled={sendDisabled}
      />
    </div>
  );
}

export default EmailContentView;
