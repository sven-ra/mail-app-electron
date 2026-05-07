import React, { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
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
  const shouldPreferThreadedPlaintext = shouldRenderThreadedPlaintext(email);
  const hasHtmlBody = Boolean(htmlBody) && !shouldPreferThreadedPlaintext;
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
          <div className={styles.body}>{renderThreadedBody(email.text || '(no plain text body)', email)}</div>
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

function renderThreadedBody(text, email) {
  const segments = normalizeThreadOrder(parsePlaintextThread(text));
  const hasAnySenderHints = segments.some((segment) => Boolean(segment.senderHint));
  const identity = buildParticipantIdentity(email);

  return (
    <div className={styles.threadList}>
      {segments.map((segment, index) => {
        const role = inferSegmentRole(segment, identity);
        const rowClassName = [
          styles.messageRow,
          role === 'self' ? styles.messageRowSelf : '',
          role === 'other' ? styles.messageRowOther : '',
          role === 'unknown' ? styles.messageRowUnknown : '',
        ]
          .filter(Boolean)
          .join(' ');
        const bubbleClassName = [
          styles.messageBubble,
          role === 'self' ? styles.messageBubbleSelf : '',
          role === 'other' ? styles.messageBubbleOther : '',
          role === 'unknown' ? styles.messageBubbleUnknown : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <div key={segment.id || index} className={rowClassName}>
            <div className={bubbleClassName}>
              {hasAnySenderHints && segment.senderHint ? (
                <SenderDropdown label={segment.senderHint} />
              ) : null}
              <div className={styles.messageText}>{segment.text}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
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

function parsePlaintextThread(text) {
  const lines = String(text || '').split(/\r?\n/);
  const segments = [];
  let currentLines = [];
  let currentHasBoundaryMarker = false;

  const pushSegment = () => {
    const normalizedLines = trimBlankEdges(currentLines);
    if (!normalizedLines.length) {
      currentLines = [];
      currentHasBoundaryMarker = false;
      return;
    }

    const { text: normalizedText, quoteDepth } = normalizeSegmentText(normalizedLines);
    segments.push({
      id: `segment-${segments.length}`,
      text: normalizedText,
      quoteDepth,
      hasBoundaryMarker: currentHasBoundaryMarker,
      senderHint: extractSenderHint(normalizedLines),
    });

    currentLines = [];
    currentHasBoundaryMarker = false;
  };

  lines.forEach((line, index) => {
    const previousLine = index > 0 ? lines[index - 1] : '';
    const nextLine = index < lines.length - 1 ? lines[index + 1] : '';
    const boundaryType = detectBoundaryLine(line, previousLine, nextLine);
    const shouldStartNewSegment =
      boundaryType && currentLines.some((entry) => String(entry || '').trim().length > 0);

    if (shouldStartNewSegment) {
      pushSegment();
    }

    currentLines.push(line);
    if (boundaryType) {
      currentHasBoundaryMarker = true;
    }
  });

  pushSegment();

  if (!segments.length) {
    return [
      {
        id: 'segment-0',
        text: '(no plain text body)',
        quoteDepth: 0,
        hasBoundaryMarker: false,
        senderHint: '',
      },
    ];
  }

  return segments;
}

function normalizeThreadOrder(segments) {
  if (segments.length < 2) {
    return segments;
  }

  const first = segments[0];
  const last = segments[segments.length - 1];
  const likelyNewestFirst = (!first.hasBoundaryMarker && last.hasBoundaryMarker) || first.quoteDepth < last.quoteDepth;

  if (likelyNewestFirst) {
    return [...segments].reverse();
  }

  return segments;
}

function detectBoundaryLine(line, previousLine, nextLine) {
  const value = String(line || '').trim();
  if (!value) {
    return false;
  }

  const boundaryPatterns = [
    /^on .+wrote:$/i,
    /^from:\s+.+$/i,
    /^sent:\s+.+$/i,
    /^date:\s+.+$/i,
    /^to:\s+.+$/i,
    /^subject:\s+.+$/i,
    /^-+\s*original message\s*-+$/i,
    /^begin forwarded message:$/i,
  ];

  if (boundaryPatterns.some((pattern) => pattern.test(value))) {
    return true;
  }

  const dequotedLine = extractQuoteDepth(value).content.trim();
  if (boundaryPatterns.some((pattern) => pattern.test(dequotedLine))) {
    return true;
  }

  const isHeaderLine = /^(from|date|to|subject|sent):\s+/i.test(value);
  if (!isHeaderLine) {
    return false;
  }

  const previousIsBlank = !String(previousLine || '').trim();
  const nextLooksLikeHeader = /^(from|date|to|subject|sent):\s+/i.test(String(nextLine || '').trim());
  return previousIsBlank && nextLooksLikeHeader;
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

function normalizeSegmentText(lines) {
  const nonEmptyLines = lines.filter((line) => String(line || '').trim().length > 0);
  const quoteDepths = nonEmptyLines.map((line) => extractQuoteDepth(line).depth);
  const stripDepth = quoteDepths.length > 0 ? Math.max(...quoteDepths) : 0;

  const normalizedLines = lines.map((line) => {
    let content = String(line || '');
    let depthToStrip = stripDepth;
    while (depthToStrip > 0) {
      const extracted = extractQuoteDepth(content);
      if (extracted.depth === 0) {
        break;
      }
      content = extracted.content;
      depthToStrip -= 1;
    }
    return sanitizeInlineQuoteArtifacts(content);
  });

  return {
    text: normalizedLines.join('\n'),
    quoteDepth: stripDepth,
  };
}

function sanitizeInlineQuoteArtifacts(line) {
  return String(line || '')
    .replace(/([,.;:!?])\s*>+\s*/g, '$1 ')
    .replace(/\s*>{3,}\s*/g, ' ')
    .replace(/[ \t]{2,}/g, ' ');
}

function extractSenderHint(lines) {
  for (const line of lines) {
    const value = String(line || '').trim();
    const plain = extractQuoteDepth(value).content.trim();
    const fromMatch = plain.match(/^from:\s+(.+)$/i);
    if (fromMatch) {
      return fromMatch[1].trim();
    }

    const onWroteMatch = plain.match(/^on .+,\s*(.+?)\s+wrote:$/i);
    if (onWroteMatch) {
      return onWroteMatch[1].trim();
    }
  }

  return '';
}

function buildParticipantIdentity(email) {
  return {
    selfTokens: tokenizeIdentity(`${email?.to || ''}`),
    otherTokens: tokenizeIdentity(`${email?.from || ''}`),
  };
}

function tokenizeIdentity(value) {
  const matches = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|[A-Z][A-Z0-9._-]{1,}/gi) || [];
  return matches.map((entry) => entry.toLowerCase());
}

function inferSegmentRole(segment, identity) {
  const hint = String(segment?.senderHint || '').toLowerCase();
  if (!hint) {
    return 'unknown';
  }

  if (identity.selfTokens.some((token) => hint.includes(token))) {
    return 'self';
  }

  if (identity.otherTokens.some((token) => hint.includes(token))) {
    return 'other';
  }

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
  const stringValue = String(value || '').trim();
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

function getHtmlBody(html) {
  if (typeof html === 'string') {
    return html.trim();
  }
  if (html == null) {
    return '';
  }
  return String(html).trim();
}

function shouldRenderThreadedPlaintext(email) {
  const text = String(email?.text || '');
  if (!text.trim()) {
    return false;
  }

  const threadMarkers = [
    /\bon\s.+\bwrote:\s*$/im,
    /^from:\s+.+$/im,
    /^sent:\s+.+$/im,
    /^date:\s+.+$/im,
    /^to:\s+.+$/im,
    /^subject:\s+.+$/im,
    /^-+\s*original message\s*-+$/im,
    /^begin forwarded message:$/im,
  ];

  return threadMarkers.some((pattern) => pattern.test(text));
}

export default EmailContent;
