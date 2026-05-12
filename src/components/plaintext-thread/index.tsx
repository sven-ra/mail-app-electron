import React, { useMemo } from 'react';
import { extractLatestReplyHtml } from '../prepareEmailHtml';
import SenderDropdown from '../sender-dropdown';
import {
  buildCidAttachmentMap,
  buildParticipantIdentity,
  collectOrphanImages,
  collectUsedCids,
  inferSegmentRole,
  splitTextByCidMarkers,
} from '../../mail/plaintextThread';
import { interceptMailLinkActivation } from '../../mail/openEmailLinkExternally';
import styles from './styles.module.css';
import type { CidAttachmentEntry, LoadedEmailContent, PlaintextSegment } from '../../types/mail';

function renderTextWithCidImages(text: string, cidMap: Map<string, CidAttachmentEntry>) {
  const parts = splitTextByCidMarkers(text);

  if (!parts.length) {
    return '';
  }

  if (parts.length === 1 && parts[0].type === 'text') {
    return parts[0].value;
  }

  return parts.map((part, index) => {
    if (part.type === 'text') {
      return <React.Fragment key={`text-${index}`}>{part.value}</React.Fragment>;
    }

    const entry = cidMap.get(part.value);
    if (entry) {
      return (
        <img
          key={`cid-${index}`}
          src={entry.dataUrl}
          alt={entry.filename || part.value}
          className={styles.threadInlineImage}
        />
      );
    }

    return <React.Fragment key={`raw-${index}`}>{part.raw}</React.Fragment>;
  });
}

type PlaintextThreadProps = {
  segments: PlaintextSegment[];
  email: LoadedEmailContent;
};

function PlaintextThread({ segments, email }: PlaintextThreadProps) {
  const identity = useMemo(() => buildParticipantIdentity(email), [email]);
  const segmentRoles = useMemo(
    () => segments.map((segment) => inferSegmentRole(segment, identity)),
    [segments, identity]
  );
  const cidMap = useMemo(() => buildCidAttachmentMap(email?.attachments), [email?.attachments]);
  const latestReplyHtml = useMemo(
    () => extractLatestReplyHtml(email?.html, email?.attachments),
    [email?.html, email?.attachments]
  );
  const usedCids = useMemo(() => collectUsedCids(latestReplyHtml, segments, cidMap), [
    latestReplyHtml,
    segments,
    cidMap,
  ]);
  const orphanImages = useMemo(
    () => collectOrphanImages(email?.attachments, usedCids),
    [email?.attachments, usedCids]
  );
  const lastIndex = segments.length - 1;

  return (
    <div className={styles.threadList}>
      {segments.map((segment, index) => {
        const role = segmentRoles[index] || 'unknown';
        const blockClassName = [
          styles.threadBlock,
          role === 'self' ? styles.threadBlockSelf : '',
          role === 'other' ? styles.threadBlockOther : '',
        ]
          .filter(Boolean)
          .join(' ');
        const isLast = index === lastIndex;
        const showSentTag = Boolean(email?.isThreadInjectedFromSent) && (role === 'self' || isLast);
        const showHtmlBody = isLast && segments.length <= 1 && Boolean(latestReplyHtml);
        const showOrphanImages = isLast && orphanImages.length > 0;

        return (
          <section key={segment.id || index} className={blockClassName}>
            <header className={styles.threadBlockSender}>
              {segment.senderHint ? (
                <SenderDropdown label={segment.senderHint} />
              ) : role === 'self' ? (
                <span className={styles.threadBlockSenderFallback}>You</span>
              ) : email?.from ? (
                <SenderDropdown label={email.from} />
              ) : (
                <span className={styles.threadBlockSenderFallback}>Unknown sender</span>
              )}
              {segment.dateHint ? <span className={styles.threadBlockDate}>{segment.dateHint}</span> : null}
              {showSentTag ? <span className={styles.sentTag}>found in sent</span> : null}
            </header>
            {showHtmlBody ? (
              <div
                className={styles.threadBlockHtml}
                dangerouslySetInnerHTML={{ __html: latestReplyHtml }}
                onClickCapture={(e) => interceptMailLinkActivation(e.nativeEvent)}
                onAuxClickCapture={(e) => interceptMailLinkActivation(e.nativeEvent)}
              />
            ) : (
              <div className={styles.threadBlockBody}>{renderTextWithCidImages(segment.text, cidMap)}</div>
            )}
            {showOrphanImages ? (
              <div className={styles.threadBlockImages}>
                {orphanImages.map((image) => (
                  <img
                    key={image.id}
                    src={image.dataUrl}
                    alt={image.alt}
                    className={styles.threadBlockImage}
                  />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export default PlaintextThread;
