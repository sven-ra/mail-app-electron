import type { EmailAttachment } from '../types/mail';

const TRIMMED_LABEL = 'Show trimmed content';

const QUOTE_SELECTORS = [
  'div.gmail_quote',
  'div.gmail_attr',
  'blockquote[type="cite"]',
  'div#divRplyFwdMsg',
  'div.OutlookMessageHeader',
  'div.moz-cite-prefix',
];

export function prepareEmailHtml(html: unknown, attachments: EmailAttachment[] | undefined): string {
  const safeHtml = typeof html === 'string' ? html : '';
  if (!safeHtml.trim()) {
    return '';
  }

  const cidMap = buildCidMap(attachments);
  const parser = new DOMParser();
  const doc = parser.parseFromString(safeHtml, 'text/html');

  rewriteCidImages(doc, cidMap);
  collapseQuotedHistory(doc);
  injectThemedStyles(doc);

  return `<!DOCTYPE html>${doc.documentElement.outerHTML}`;
}

export function extractLatestReplyHtml(
  html: unknown,
  attachments: EmailAttachment[] | undefined
): string {
  const safeHtml = typeof html === 'string' ? html : '';
  if (!safeHtml.trim()) {
    return '';
  }

  const cidMap = buildCidMap(attachments);
  const doc = new DOMParser().parseFromString(safeHtml, 'text/html');

  rewriteCidImages(doc, cidMap);
  removeQuotedHistory(doc);
  sanitizeForInline(doc);

  if (!doc.body) return '';
  return doc.body.innerHTML.trim();
}

function removeQuotedHistory(doc: Document): void {
  const quote = findQuoteContainer(doc);
  if (!quote) return;

  let sibling = quote.nextSibling;
  while (sibling) {
    const next = sibling.nextSibling;
    sibling.remove();
    sibling = next;
  }
  quote.remove();
}

const DROP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'LINK',
  'META',
  'BASE',
  'OBJECT',
  'EMBED',
  'IFRAME',
  'NOSCRIPT',
]);

function sanitizeForInline(doc: Document): void {
  if (!doc.body) return;

  doc.body.querySelectorAll('*').forEach((el) => {
    if (DROP_TAGS.has(el.tagName)) {
      el.remove();
      return;
    }

    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        return;
      }
      if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    });
  });
}

function buildCidMap(attachments: EmailAttachment[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(attachments)) return map;

  attachments.forEach((att) => {
    if (!att || !att.dataBase64) return;
    const dataUrl = `data:${att.contentType || 'application/octet-stream'};base64,${att.dataBase64}`;
    const keys = [att.contentId, att.cid].filter(Boolean);
    keys.forEach((key) => {
      const normalized = String(key).trim().replace(/^<|>$/g, '').toLowerCase();
      if (normalized) {
        map.set(normalized, dataUrl);
      }
    });
  });

  return map;
}

function rewriteCidImages(doc: Document, cidMap: Map<string, string>): void {
  const images = doc.querySelectorAll('img[src^="cid:" i], img[src^="CID:"]');
  images.forEach((img) => {
    const src = img.getAttribute('src') || '';
    const cid = src.replace(/^cid:/i, '').trim().toLowerCase();
    const dataUrl = cidMap.get(cid);
    if (dataUrl) {
      img.setAttribute('src', dataUrl);
    }
  });

  const elementsWithBackground = doc.querySelectorAll('[style*="cid:" i]');
  elementsWithBackground.forEach((el) => {
    const style = el.getAttribute('style') || '';
    const next = style.replace(/url\((['"]?)cid:([^'")]+)\1\)/gi, (match, quote, rawCid) => {
      const cid = String(rawCid).trim().toLowerCase();
      const dataUrl = cidMap.get(cid);
      return dataUrl ? `url(${quote}${dataUrl}${quote})` : match;
    });
    if (next !== style) {
      el.setAttribute('style', next);
    }
  });
}

function collapseQuotedHistory(doc: Document): void {
  const target = findQuoteContainer(doc);
  if (!target) return;
  if (target.closest('details[data-quoted-history="true"]')) return;

  const details = doc.createElement('details');
  details.setAttribute('data-quoted-history', 'true');
  const summary = doc.createElement('summary');
  summary.textContent = TRIMMED_LABEL;
  details.appendChild(summary);

  target.parentNode.insertBefore(details, target);
  details.appendChild(target);

  let sibling = details.nextSibling;
  while (sibling) {
    const next = sibling.nextSibling;
    details.appendChild(sibling);
    sibling = next;
  }
}

function findQuoteContainer(doc: Document): Element | null {
  for (const selector of QUOTE_SELECTORS) {
    const found = doc.querySelector(selector);
    if (found && !isInsideExcluded(found)) {
      return found;
    }
  }

  const outlookDivider = findOutlookDivider(doc);
  if (outlookDivider) return outlookDivider;

  const fallback = findFallbackBlockquote(doc);
  if (fallback) return fallback;

  return null;
}

function isInsideExcluded(element: Element): boolean {
  return Boolean(element.closest('details[data-quoted-history="true"]'));
}

function findOutlookDivider(doc: Document): Element | null {
  const divs = doc.querySelectorAll('div[style]');
  for (const div of divs) {
    const style = (div.getAttribute('style') || '').toLowerCase();
    if (style.includes('border-top') && style.includes('solid') && style.includes('1pt')) {
      return div;
    }
  }
  return null;
}

function findFallbackBlockquote(doc: Document): Element | null {
  const blockquotes = Array.from(doc.querySelectorAll('blockquote'));
  if (!blockquotes.length) return null;

  for (const bq of blockquotes) {
    if (bq.parentElement === doc.body) {
      return bq;
    }
  }

  return blockquotes[0];
}

function injectThemedStyles(doc: Document): void {
  const head = doc.head || doc.getElementsByTagName('head')[0];
  if (!head) return;

  const existing = head.querySelector('style[data-mail-theme="true"]');
  if (existing) return;

  const style = doc.createElement('style');
  style.setAttribute('data-mail-theme', 'true');
  style.textContent = `
    html, body {
      margin: 0;
      padding: 0;
      background: transparent;
      color: inherit;
    }
    body {
      padding: 4px 2px 16px;
      font-family: inherit;
      font-size: inherit;
      line-height: 1.45;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    img, video {
      max-width: 100%;
      height: auto;
    }
    table {
      max-width: 100%;
    }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
    }
    blockquote {
      margin: 8px 0;
      padding-left: 10px;
      border-left: 2px solid currentColor;
      opacity: 0.85;
    }
    details[data-quoted-history="true"] {
      margin-top: 12px;
    }
    details[data-quoted-history="true"] > summary {
      display: inline-block;
      cursor: pointer;
      padding: 4px 10px;
      border: 1px solid currentColor;
      border-radius: 999px;
      font-size: 0.85em;
      list-style: none;
      user-select: none;
    }
    details[data-quoted-history="true"] > summary::-webkit-details-marker {
      display: none;
    }
    details[data-quoted-history="true"][open] > summary {
      margin-bottom: 8px;
    }
    a {
      color: inherit;
      text-decoration: underline;
    }
  `;
  head.appendChild(style);
}
