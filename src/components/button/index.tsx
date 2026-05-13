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

export type ButtonVariantModifier = 'ghost' | 'rounded';

const variantClass: Record<ButtonVariantModifier, string> = {
  ghost: styles.variantGhost,
  rounded: styles.variantRounded,
};

function variantModifiersToClass(variant?: ButtonVariantModifier | ButtonVariantModifier[]) {
  if (variant == null) {
    return '';
  }
  const list = Array.isArray(variant) ? variant : [variant];
  return list.map((v) => variantClass[v]).filter(Boolean).join(' ');
}

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
  variant?: ButtonVariantModifier | ButtonVariantModifier[];
  /** Merged onto the inner label span when present. */
  labelClassName?: string;
  /** Radix icon export name, e.g. `ArchiveIcon`. */
  icon?: RadixIconName;
  /** Radix icon export name shown after the label. */
  iconBack?: RadixIconName;
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    size = 'md',
    variant,
    labelClassName = '',
    icon,
    iconBack,
    type = 'button',
    className = '',
    children,
    ...rest
  },
  ref,
) {
  const variantClassStr = variantModifiersToClass(variant);
  const rootClass = `${styles.root} ${sizeClass[size]} ${variantClassStr} ${className}`.trim();
  const showLabel = children != null && children !== false && children !== '';
  const labelClass = `${styles.label} ${labelClassName}`.trim();

  return (
    <button ref={ref} type={type} className={rootClass} {...rest}>
      {icon ? renderRadixIcon(icon) : null}
      {showLabel ? <span className={labelClass}>{children}</span> : null}
      {iconBack ? renderRadixIcon(iconBack) : null}
    </button>
  );
});

export default Button;
