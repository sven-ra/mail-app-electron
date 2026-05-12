import React from 'react';
import styles from './styles.module.css';

type ColumnResizerProps = {
  isResizing: boolean;
  onPointerDown: React.PointerEventHandler<HTMLDivElement>;
};

function ColumnResizer({ isResizing, onPointerDown }: ColumnResizerProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize list column"
      className={`${styles.root} ${isResizing ? styles.rootResizing : ''}`}
      onPointerDown={onPointerDown}
    />
  );
}

export default ColumnResizer;
