import React, { useEffect, useRef } from 'react';
import styles from './styles.module.css';

type HtmlEmailFrameProps = {
  html: string;
};

function HtmlEmailFrame({ html }: HtmlEmailFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

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
    const nextHeight = Math.max(doc.documentElement.scrollHeight, doc.body ? doc.body.scrollHeight : 0);
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

    const images = doc.querySelectorAll<HTMLImageElement>('img');
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

export default HtmlEmailFrame;
