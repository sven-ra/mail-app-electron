import React from 'react';
import styles from './styles.module.css';

export type TextInputProps = React.ComponentPropsWithoutRef<'input'>;

const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { type = 'text', className = '', ...rest },
  ref,
) {
  const rootClass = `${styles.root} ${className}`.trim();
  return <input ref={ref} type={type} className={rootClass} {...rest} />;
});

export default TextInput;
