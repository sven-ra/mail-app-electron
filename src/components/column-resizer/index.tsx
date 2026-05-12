import React from 'react';
import styles from './styles.module.css';

type ColumnResizerProps = {
  isResizing: boolean;
  onPointerDown: React.PointerEventHandler<HTMLDivElement>;
  /** When `null`, no `aria-label` is set (unnamed separator). */
  ariaLabel?: string | null;
};

function ColumnResizer({ isResizing, onPointerDown, ariaLabel }: ColumnResizerProps) {
  const ariaProps =
    ariaLabel === null ? {} : { 'aria-label': ariaLabel ?? 'Resize list column' };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      {...ariaProps}
      className={`${styles.root} ${isResizing ? styles.rootResizing : ''}`}
      onPointerDown={onPointerDown}
    />
  );
}

export default ColumnResizer;
