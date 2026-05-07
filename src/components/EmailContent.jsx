import React, { useEffect, useMemo, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import styles from './EmailContent.module.css';
import { prepareEmailHtml, extractLatestReplyHtml } from './prepareEmailHtml.js';

function EmailContent({ email }) {
  const messageAreaRef = useRef(null);
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

  const preparedHtml = useMemo(() => {
    if (!email || email.loading || email.error) return '';
    return prepareEmailHtml(email.html, email.attachments);
  }, [email]);

  const threadSegments = useMemo(() => {
    if (!email || email.loading || email.error) return [];
    return normalizeThreadOrder(parsePlaintextThread(email.text || ''));
  }, [email]);

  const showHtml = Boolean(preparedHtml) && threadSegments.length <= 1;

  useEffect(() => {
    const node = messageAreaRef.current;
    if (!node) return;
    if (!email || email.loading || email.error) return;

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
    node.querySelectorAll('img').forEach((img) => {
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

  return (
    <>
      <div className={styles.subjectRow}>
        <h3>{email.subject}</h3>
      </div>
      <div className={styles.meta}>
        <b>From:</b> {formatHeaderValue(email.from)}
        <br />
        <b>To:</b> {formatHeaderValue(email.to)}
        <br />
        <b>Date:</b> {formatHeaderValue(email.date)}
        <br />
        <hr />
      </div>
      <div className={styles.messageArea} ref={messageAreaRef}>
        {showHtml ? (
          <HtmlEmailFrame html={preparedHtml} />
        ) : (
          <PlaintextThread segments={threadSegments} email={email} />
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
    </>
  );
}

function HtmlEmailFrame({ html }) {
  const iframeRef = useRef(null);
  const observerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, []);

  function syncIframeHeight() {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc || !doc.documentElement) return;
    const nextHeight = Math.max(
      doc.documentElement.scrollHeight,
      doc.body ? doc.body.scrollHeight : 0
    );
    if (nextHeight > 0) {
      iframe.style.height = `${nextHeight}px`;
    }
  }

  function handleLoad() {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;

    syncIframeHeight();

    const images = doc.querySelectorAll('img');
    images.forEach((img) => {
      if (img.complete) return;
      img.addEventListener('load', syncIframeHeight, { once: true });
      img.addEventListener('error', syncIframeHeight, { once: true });
    });

    doc.addEventListener('toggle', syncIframeHeight, true);

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    if (typeof ResizeObserver !== 'undefined' && doc.body) {
      observerRef.current = new ResizeObserver(() => syncIframeHeight());
      observerRef.current.observe(doc.body);
    }
  }

  return (
    <iframe
      ref={iframeRef}
      className={styles.htmlFrame}
      title="Email HTML content"
      sandbox="allow-same-origin"
      srcDoc={html}
      onLoad={handleLoad}
    />
  );
}

function PlaintextThread({ segments, email }) {
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
        const showSentTag =
          Boolean(email?.isThreadInjectedFromSent) &&
          (role === 'self' || isLast);
        const showHtmlBody = isLast && segments.length <= 1 && Boolean(latestReplyHtml);
        const showOrphanImages = isLast && orphanImages.length > 0;

        return (
          <section key={segment.id || index} className={blockClassName}>
            <header className={styles.threadBlockSender}>
              {segment.senderHint ? (
                <SenderDropdown label={segment.senderHint} />
              ) : (
                <span className={styles.threadBlockSenderFallback}>
                  {role === 'self' ? 'You' : email?.from || 'Unknown sender'}
                </span>
              )}
              {segment.dateHint ? (
                <span className={styles.threadBlockDate}>{segment.dateHint}</span>
              ) : null}
              {showSentTag ? <span className={styles.sentTag}>found in sent</span> : null}
            </header>
            {showHtmlBody ? (
              <div
                className={styles.threadBlockHtml}
                dangerouslySetInnerHTML={{ __html: latestReplyHtml }}
              />
            ) : (
              <div className={styles.threadBlockBody}>
                {renderTextWithCidImages(segment.text, cidMap)}
              </div>
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

function buildCidAttachmentMap(attachments) {
  const map = new Map();
  if (!Array.isArray(attachments)) return map;

  attachments.forEach((att) => {
    if (!att || !att.dataBase64) return;
    const dataUrl = `data:${att.contentType || 'application/octet-stream'};base64,${att.dataBase64}`;
    const entry = { dataUrl, filename: att.filename || '', contentType: att.contentType || '' };
    [att.contentId, att.cid, att.filename].forEach((key) => {
      const normalized = String(key || '')
        .trim()
        .replace(/^<|>$/g, '')
        .toLowerCase();
      if (normalized) {
        map.set(normalized, entry);
      }
    });
  });

  return map;
}

const CID_MARKER_REGEX = /\[cid:([^\]]+)\]/gi;

function renderTextWithCidImages(text, cidMap) {
  const value = String(text || '');
  if (!value) return value;
  if (!cidMap || cidMap.size === 0 || !value.includes('[cid:')) {
    return value;
  }

  const nodes = [];
  let lastIndex = 0;
  let match;
  CID_MARKER_REGEX.lastIndex = 0;
  while ((match = CID_MARKER_REGEX.exec(value)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(value.slice(lastIndex, match.index));
    }
    const rawCid = match[1].trim();
    const entry = cidMap.get(rawCid.toLowerCase());
    if (entry) {
      nodes.push(
        <img
          key={`cid-${match.index}`}
          src={entry.dataUrl}
          alt={entry.filename || rawCid}
          className={styles.threadInlineImage}
        />
      );
    } else {
      nodes.push(match[0]);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < value.length) {
    nodes.push(value.slice(lastIndex));
  }

  return nodes;
}

function collectUsedCids(latestReplyHtml, segments, cidMap) {
  const used = new Set();
  if (!cidMap || cidMap.size === 0) return used;

  if (typeof latestReplyHtml === 'string' && latestReplyHtml.includes('data:')) {
    cidMap.forEach((entry, key) => {
      if (latestReplyHtml.includes(entry.dataUrl)) {
        used.add(key);
      }
    });
  }

  if (Array.isArray(segments)) {
    segments.forEach((segment) => {
      const text = String(segment?.text || '');
      if (!text.includes('[cid:')) return;
      let match;
      CID_MARKER_REGEX.lastIndex = 0;
      while ((match = CID_MARKER_REGEX.exec(text)) !== null) {
        const key = match[1].trim().toLowerCase();
        if (cidMap.has(key)) {
          used.add(key);
        }
      }
    });
  }

  return used;
}

function collectOrphanImages(attachments, usedCids) {
  if (!Array.isArray(attachments)) return [];
  const result = [];
  const seen = new Set();

  attachments.forEach((att, attIndex) => {
    if (!att || !att.dataBase64) return;
    const contentType = String(att.contentType || '').toLowerCase();
    if (!contentType.startsWith('image/')) return;

    const candidateKeys = [att.contentId, att.cid, att.filename]
      .filter(Boolean)
      .map((key) => String(key).trim().replace(/^<|>$/g, '').toLowerCase());
    const isUsed = candidateKeys.some((key) => usedCids?.has(key));
    if (isUsed) return;

    const id = candidateKeys[0] || `att-${attIndex}`;
    if (seen.has(id)) return;
    seen.add(id);

    result.push({
      id,
      dataUrl: `data:${att.contentType || 'application/octet-stream'};base64,${att.dataBase64}`,
      alt: att.filename || '',
    });
  });

  return result;
}

function SenderDropdown({ label }) {
  const address = getAddressForActions(label);
  const displayName = getSenderDisplayName(label);

  async function handleCopyAddress() {
    if (!address) {
      return;
    }

    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(address);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = address;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  function handleSendMail() {
    // Placeholder action until send-email flow is implemented.
  }

  return (
    <div className={styles.messageSender}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className={styles.messageSenderButton}>
            {displayName}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={styles.senderMenuContent} sideOffset={4} align="start">
            <DropdownMenu.Label className={styles.senderMenuLabel}>{address || label}</DropdownMenu.Label>
            <DropdownMenu.Item className={styles.senderMenuItem} onSelect={handleCopyAddress}>
              Copy address
            </DropdownMenu.Item>
            <DropdownMenu.Item className={styles.senderMenuItem} onSelect={handleSendMail}>
              Send mail
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

function extractQuoteDepth(line) {
  const value = String(line || '');
  let index = 0;

  while (value[index] === ' ' || value[index] === '\t') {
    index += 1;
  }

  let depth = 0;
  while (value[index] === '>') {
    depth += 1;
    index += 1;
    if (value[index] === ' ') {
      index += 1;
    }
  }

  return { depth, content: value.slice(index) };
}

function parsePlaintextThread(text) {
  const normalizedText = normalizeThreadText(text);
  const lines = String(normalizedText || '').split('\n');
  const segments = [];
  let currentLines = [];
  let currentBoundaryLine = '';
  let currentHasBoundary = false;

  function pushSegment() {
    const trimmed = trimBlankEdges(currentLines);
    if (!trimmed.length) {
      currentLines = [];
      currentBoundaryLine = '';
      currentHasBoundary = false;
      return;
    }

    const depthInfo = stripPerLineQuoteMarkers(trimmed);
    const bodyLines = stripLeadingBoundaryLines(trimmed);
    const bodyInfo = stripPerLineQuoteMarkers(bodyLines.length ? bodyLines : trimmed);
    const senderHint = extractSenderHint(currentBoundaryLine, trimmed);
    const dateHint = extractDateHint(currentBoundaryLine, trimmed);

    segments.push({
      id: `segment-${segments.length}`,
      text: bodyInfo.text,
      quoteDepth: depthInfo.minDepth,
      hasBoundaryMarker: currentHasBoundary,
      senderHint,
      dateHint,
    });

    currentLines = [];
    currentBoundaryLine = '';
    currentHasBoundary = false;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const previousLine = index > 0 ? lines[index - 1] : '';
    const nextLine = index < lines.length - 1 ? lines[index + 1] : '';
    const boundaryType = detectBoundaryLine(line, previousLine, nextLine);
    const hasContent = currentLines.some((entry) => String(entry || '').trim().length > 0);

    if (boundaryType && hasContent) {
      pushSegment();
    }

    currentLines.push(line);

    if (boundaryType) {
      currentHasBoundary = true;
      if (!currentBoundaryLine) {
        currentBoundaryLine = line;
      }
    }
  }

  pushSegment();

  if (!segments.length) {
    return [
      {
        id: 'segment-0',
        text: '(no plain text body)',
        quoteDepth: 0,
        hasBoundaryMarker: false,
        senderHint: '',
        dateHint: '',
      },
    ];
  }

  return segments;
}

function normalizeThreadText(text) {
  const source = String(text || '');
  if (!source) return '';

  const normalizedLineEndings = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const hasSoftBreaks = /=\n/.test(normalizedLineEndings);
  const hasUtf8HexEscapes = /=(?:C2|C3|C4|C5|C6|C7|C8|C9|CA|CB|CC|CD|CE|CF|D0|D1|D2|D3|D4|D5|D6|D7|D8|D9|DA|DB|DC|DD|DE|DF|E2|E3|E4|E5|E6|E7|E8|E9|EA|EB|EC|ED|EE|EF)/i.test(
    normalizedLineEndings
  );

  if (!hasSoftBreaks && !hasUtf8HexEscapes) {
    return normalizedLineEndings;
  }

  const unfolded = normalizedLineEndings.replace(/=\n/g, '');
  if (!/=([0-9A-F]{2})/i.test(unfolded)) {
    return unfolded;
  }

  try {
    return decodeQuotedPrintableText(unfolded);
  } catch {
    return unfolded;
  }
}

function decodeQuotedPrintableText(value) {
  const input = String(value || '');
  const encoder = new TextEncoder();
  const bytes = [];

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '=' && /^[0-9a-f]{2}$/i.test(input.slice(index + 1, index + 3))) {
      bytes.push(parseInt(input.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }
    bytes.push(...encoder.encode(char));
  }

  return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
}

function normalizeThreadOrder(segments) {
  if (segments.length < 2) {
    return segments;
  }

  const first = segments[0];
  const last = segments[segments.length - 1];
  const midpoint = Math.floor(segments.length / 2);
  const firstHalf = segments.slice(0, midpoint || 1);
  const lastHalf = segments.slice(midpoint || 1);
  const firstHalfAverageDepth =
    firstHalf.reduce((sum, segment) => sum + Number(segment.quoteDepth || 0), 0) / firstHalf.length;
  const lastHalfAverageDepth = lastHalf.length
    ? lastHalf.reduce((sum, segment) => sum + Number(segment.quoteDepth || 0), 0) / lastHalf.length
    : firstHalfAverageDepth;
  const likelyNewestFirst =
    (!first.hasBoundaryMarker && last.hasBoundaryMarker) ||
    first.quoteDepth < last.quoteDepth ||
    lastHalfAverageDepth > firstHalfAverageDepth;

  if (likelyNewestFirst) {
    return [...segments].reverse();
  }

  return segments;
}

function detectBoundaryLine(line, previousLine, nextLine) {
  const value = String(line || '').trim();
  if (!value) return false;

  const dequoted = extractQuoteDepth(value).content.trim();
  const previousDequoted = extractQuoteDepth(String(previousLine || '').trim()).content.trim();
  const nextDequoted = extractQuoteDepth(String(nextLine || '').trim()).content.trim();
  const boundaryCandidates = buildBoundaryCandidates(line, nextLine);

  const explicitPatterns = [
    /^on\s.+\bwrote:\s*$/i,
    /^on\s.+\bat\s.+\bwrote:\s*$/i,
    /^.+\bwrote:\s*$/i,
    /^am\s.+\bschrieb\s.+:\s*$/i,
    /^le\s.+\ba\s+[eé]crit\s*:\s*$/i,
    /^el\s.+\bescribi[oó]\s*:\s*$/i,
    /^den\s.+\bskrev\s.+:\s*$/i,
    /^kontakt\s+.+\skirjutas\s+kuup[äa]eval\s+.+:\s*$/i,
    /^.+\skirjutas\s+kuup[äa]eval\s+.+:\s*$/i,
    /^-+\s*original message\s*-+$/i,
    /^-+\s*forwarded message\s*-+$/i,
    /^begin forwarded message:\s*$/i,
    /^_{5,}\s*$/i,
  ];

  if (
    explicitPatterns.some((pattern) =>
      boundaryCandidates.some((candidate) => pattern.test(candidate))
    )
  ) {
    return true;
  }

  if (isHeaderLine(dequoted)) {
    const previousLooksLikeHeader = isHeaderLine(previousDequoted);
    const nextLooksLikeHeader = isHeaderLine(nextDequoted);
    return !previousLooksLikeHeader && nextLooksLikeHeader;
  }

  return false;
}

function isHeaderLine(line) {
  return /^(from|date|to|subject|sent|cc|bcc|reply-to):\s+/i.test(String(line || '').trim());
}

function buildBoundaryCandidates(line, nextLine) {
  const value = String(line || '').trim();
  const dequoted = extractQuoteDepth(value).content.trim();
  const mergedBoundary = mergeWrappedBoundaryLine(line, nextLine);
  const candidates = [value, dequoted, mergedBoundary].filter(Boolean);
  return Array.from(new Set(candidates));
}

function mergeWrappedBoundaryLine(line, nextLine) {
  const currentValue = String(line || '').trim();
  const nextValue = String(nextLine || '').trim();
  if (!currentValue || !nextValue) return '';

  const current = extractQuoteDepth(currentValue);
  const next = extractQuoteDepth(nextValue);
  const currentPlain = current.content.trim();
  const nextPlain = next.content.trim();
  if (!currentPlain || !nextPlain) return '';
  if (current.depth !== next.depth) return '';
  if (!looksLikeWrappedBoundary(currentPlain, nextPlain)) return '';

  return `${currentPlain} ${nextPlain}`.replace(/\s+/g, ' ').trim();
}

function looksLikeWrappedBoundary(currentPlain, nextPlain) {
  if (!currentPlain || !nextPlain) return false;
  if (/:\s*$/.test(currentPlain)) return false;

  const startsBoundary =
    /kirjutas\s+kuup[äa]eval/i.test(currentPlain) ||
    /\bon\s.+\bwrote\b/i.test(currentPlain) ||
    /\bam\s.+\bschrieb\b/i.test(currentPlain) ||
    /\ble\s.+\ba\s+[eé]crit\b/i.test(currentPlain) ||
    /\bel\s.+\bescribi[oó]\b/i.test(currentPlain);
  if (!startsBoundary) return false;

  return /:\s*$/.test(nextPlain) || /\b(kell|at)\b/i.test(nextPlain) || /\d{1,2}:\d{2}/.test(nextPlain);
}

function trimBlankEdges(lines) {
  let start = 0;
  let end = lines.length;

  while (start < end && !String(lines[start] || '').trim()) {
    start += 1;
  }

  while (end > start && !String(lines[end - 1] || '').trim()) {
    end -= 1;
  }

  return lines.slice(start, end);
}

function stripLeadingBoundaryLines(lines) {
  const source = Array.isArray(lines) ? [...lines] : [];
  if (!source.length) return source;

  const first = source[0];
  const second = source[1] || '';
  if (!detectBoundaryLine(first, '', second)) {
    return source;
  }

  let dropCount = 1;
  let composedBoundary = extractQuoteDepth(String(first || '').trim()).content.trim();

  while (dropCount < source.length && composedBoundary && !/:\s*$/.test(composedBoundary)) {
    const previous = source[dropCount - 1];
    const current = source[dropCount];
    const merged = mergeWrappedBoundaryLine(previous, current);

    if (merged) {
      composedBoundary = merged;
      dropCount += 1;
      continue;
    }

    break;
  }

  const remaining = source.slice(dropCount);
  while (remaining.length && !String(remaining[0] || '').trim()) {
    remaining.shift();
  }
  return remaining;
}

function stripPerLineQuoteMarkers(lines) {
  const depths = lines.map((line) => extractQuoteDepth(line).depth);
  const nonZero = depths.filter((depth) => depth > 0);
  const minDepth = nonZero.length ? Math.min(...nonZero) : 0;

  const stripped = lines.map((line, index) => {
    let content = String(line || '');
    let depthToStrip = Math.min(depths[index], minDepth || depths[index]);
    while (depthToStrip > 0) {
      const extracted = extractQuoteDepth(content);
      if (extracted.depth === 0) break;
      content = extracted.content;
      depthToStrip -= 1;
    }
    return content;
  });

  return {
    text: stripped.join('\n'),
    minDepth,
  };
}

function extractSenderHint(boundaryLine, lines) {
  const candidates = buildHintCandidates(boundaryLine, lines);

  for (const candidate of candidates) {
    const plain = String(candidate || '').trim();
    if (!plain) continue;

    const fromMatch = plain.match(/^from:\s+(.+)$/i);
    if (fromMatch) {
      return normalizeSenderHint(fromMatch[1].trim());
    }

    const onAtWroteMatch = plain.match(/^on\s.+?\bat\s.+?\s+(.+?)\s+wrote:\s*$/i);
    if (onAtWroteMatch) {
      return normalizeSenderHint(onAtWroteMatch[1].trim());
    }

    const onCommaWroteMatch = plain.match(/^on\s.+?,\s*(.+?)\s+wrote:\s*$/i);
    if (onCommaWroteMatch) {
      return normalizeSenderHint(onCommaWroteMatch[1].trim());
    }

    const onWroteMatch = plain.match(/^on\s.+?\s(.+?)\s+wrote:\s*$/i);
    if (onWroteMatch) {
      const candidateName = onWroteMatch[1].trim();
      if (/[a-z]/i.test(candidateName)) {
        return normalizeSenderHint(candidateName);
      }
    }

    const germanMatch = plain.match(/^am\s+.+?\s+schrieb\s+(.+?):\s*$/i);
    if (germanMatch) {
      return normalizeSenderHint(germanMatch[1].trim());
    }

    const frenchMatch = plain.match(/^le\s+.+?\s+(.+?)\s+a\s+[eé]crit\s*:\s*$/i);
    if (frenchMatch) {
      return normalizeSenderHint(frenchMatch[1].trim());
    }

    const spanishMatch = plain.match(/^el\s+.+?\s+(.+?)\s+escribi[oó]\s*:\s*$/i);
    if (spanishMatch) {
      return normalizeSenderHint(spanishMatch[1].trim());
    }

    const estonianKontaktMatch = plain.match(
      /^kontakt\s+(.+?)\s+\(.+?\)\s+kirjutas\s+kuup[äa]eval\s+.+:\s*$/i
    );
    if (estonianKontaktMatch) {
      return normalizeSenderHint(estonianKontaktMatch[1].trim());
    }

    const estonianGenericMatch = plain.match(
      /^(.+?)\s+kirjutas\s+kuup[äa]eval\s+.+:\s*$/i
    );
    if (estonianGenericMatch) {
      return normalizeSenderHint(estonianGenericMatch[1].trim());
    }
  }

  return '';
}

function normalizeSenderHint(value) {
  return String(value || '')
    .replace(/<mailto:[^>]+>/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+</g, ' <')
    .replace(/<\s+/g, '<')
    .replace(/\s+>/g, '>')
    .trim();
}

function extractDateHint(boundaryLine, lines) {
  const candidates = buildHintCandidates(boundaryLine, lines);

  for (const candidate of candidates) {
    const plain = String(candidate || '').trim();
    if (!plain) continue;

    const sentMatch = plain.match(/^sent:\s+(.+)$/i);
    if (sentMatch) return sentMatch[1].trim();

    const dateMatch = plain.match(/^date:\s+(.+)$/i);
    if (dateMatch) return dateMatch[1].trim();

    const onCommaMatch = plain.match(/^on\s+(.+),\s+.+?\s+wrote:\s*$/i);
    if (onCommaMatch) return onCommaMatch[1].trim();

    const onMatch = plain.match(/^on\s+(.+?)\s+.+?\s+wrote:\s*$/i);
    if (onMatch) return onMatch[1].trim();

    const germanMatch = plain.match(/^am\s+(.+?)\s+schrieb\s+.+:\s*$/i);
    if (germanMatch) return germanMatch[1].trim();

    const frenchMatch = plain.match(/^le\s+(.+?)\s+.+?\s+a\s+[eé]crit\s*:\s*$/i);
    if (frenchMatch) return frenchMatch[1].trim();

    const spanishMatch = plain.match(/^el\s+(.+?)\s+.+?\s+escribi[oó]\s*:\s*$/i);
    if (spanishMatch) return spanishMatch[1].trim();

    const estonianMatch = plain.match(/kirjutas\s+kuup[äa]eval\s+(.+):\s*$/i);
    if (estonianMatch) return estonianMatch[1].trim();
  }

  return '';
}

function buildHintCandidates(boundaryLine, lines) {
  const source = [boundaryLine, ...(Array.isArray(lines) ? lines : [])];
  const candidates = [];

  for (let index = 0; index < source.length; index += 1) {
    const value = String(source[index] || '').trim();
    if (!value) continue;

    const plain = extractQuoteDepth(value).content.trim();
    if (plain) {
      candidates.push(plain);
    }

    const nextLine = index < source.length - 1 ? source[index + 1] : '';
    const merged = mergeWrappedBoundaryLine(value, nextLine);
    if (merged) {
      candidates.push(merged);
    }
  }

  return Array.from(new Set(candidates));
}

function buildParticipantIdentity(email) {
  const isSentOrigin =
    Boolean(email?.isThreadInjectedFromSent) ||
    String(email?.folderKey || '').toLowerCase() === 'sent';
  const selfSource = isSentOrigin ? email?.from : email?.to;
  const otherSource = isSentOrigin ? email?.to : email?.from;
  return {
    selfTokens: tokenizeIdentity(`${selfSource || ''}`),
    otherTokens: tokenizeIdentity(`${otherSource || ''}`),
  };
}

function tokenizeIdentity(value) {
  const matches = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|[A-Z][A-Z0-9._-]{1,}/gi) || [];
  return matches.map((entry) => entry.toLowerCase());
}

function inferSegmentRole(segment, identity) {
  const hint = String(segment?.senderHint || '').toLowerCase();
  if (hint) {
    if (identity.selfTokens.some((token) => hint.includes(token))) return 'self';
    if (identity.otherTokens.some((token) => hint.includes(token))) return 'other';
  }
  const text = String(segment?.text || '').toLowerCase();
  const selfInText = identity.selfTokens.some((token) => text.includes(token));
  const otherInText = identity.otherTokens.some((token) => text.includes(token));
  if (selfInText && !otherInText) return 'self';
  if (otherInText && !selfInText) return 'other';
  return 'unknown';
}

function formatHeaderValue(text) {
  const value = String(text || '');
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

function getAddressForActions(value) {
  const stringValue = String(value || '').trim();
  const match = stringValue.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (match) {
    return match[0];
  }
  return stringValue;
}

function getSenderDisplayName(value) {
  const stringValue = normalizeSenderHint(value);
  if (!stringValue) {
    return '';
  }

  const bracketMatch = stringValue.match(/^(.*?)\s*<[^>]+>\s*$/);
  if (bracketMatch && bracketMatch[1]) {
    return bracketMatch[1].trim().replace(/^["']|["']$/g, '');
  }

  const addressMatch = stringValue.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (addressMatch && addressMatch[0].toLowerCase() === stringValue.toLowerCase()) {
    const [localPart] = stringValue.split('@');
    return localPart;
  }

  return stringValue.replace(/^["']|["']$/g, '');
}

export default EmailContent;
