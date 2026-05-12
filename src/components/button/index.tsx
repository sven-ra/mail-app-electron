import React from 'react';
import * as RadixIcons from '@radix-ui/react-icons';
import styles from './styles.module.css';

export type RadixIconName = keyof typeof RadixIcons;

type ButtonSize = 'sm' | 'md' | 'lg';

const sizeClass: Record<ButtonSize, string> = {
  sm: styles.sizeSm,
  md: styles.sizeMd,
  lg: styles.sizeLg,
};

type RadixIconSvg = React.ComponentType<React.SVGProps<SVGSVGElement>>;

function renderRadixIcon(name: RadixIconName) {
  const Cmp = RadixIcons[name] as RadixIconSvg | undefined;
  if (typeof Cmp !== 'function') {
    return null;
  }
  return <Cmp className={styles.icon} aria-hidden />;
}

export type ButtonProps = React.ComponentPropsWithoutRef<'button'> & {
  size?: ButtonSize;
  /** Radix icon export name, e.g. `ArchiveIcon`. */
  icon?: RadixIconName;
  /** Radix icon export name shown after the label. */
  iconBack?: RadixIconName;
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { size = 'md', icon, iconBack, type = 'button', className = '', children, ...rest },
  ref,
) {
  const rootClass = `${styles.root} ${sizeClass[size]} ${className}`.trim();
  const showLabel = children != null && children !== false && children !== '';

  return (
    <button ref={ref} type={type} className={rootClass} {...rest}>
      {icon ? renderRadixIcon(icon) : null}
      {showLabel ? <span className={styles.label}>{children}</span> : null}
      {iconBack ? renderRadixIcon(iconBack) : null}
    </button>
  );
});

export default Button;
