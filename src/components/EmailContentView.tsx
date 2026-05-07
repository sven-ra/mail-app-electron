import React, { useEffect, useMemo, useRef } from 'react';
import styles from './EmailContent.module.css';
import { prepareEmailHtml } from './prepareEmailHtml';
import HtmlEmailFrame from './HtmlEmailFrame';
import PlaintextThread from './PlaintextThread';
import ReplyEditorDock from './ReplyEditorDock';
import { decodeHeaderValue, normalizeThreadOrder, parsePlaintextThread } from '../mail/plaintextThread';
import type { LoadedEmailContent, SelectedEmailState } from '../types/mail';

type EmailContentViewProps = {
  email: SelectedEmailState;
};

function EmailContentView({ email }: EmailContentViewProps) {
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

    const imageHandlers = [];
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

  return (
    <>
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
      <ReplyEditorDock />
    </>
  );
}

export default EmailContentView;
