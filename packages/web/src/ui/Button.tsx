import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger';
type ButtonSize = 'normal' | 'compact';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

export function Button({
  className = '',
  type = 'button',
  variant = 'primary',
  size = 'normal',
  loading = false,
  disabled = false,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      aria-busy={loading || undefined}
      className={`ui-button ui-button--${variant === 'subtle' ? 'ghost' : variant} ui-button--${size} ${className}`.trim()}
      disabled={disabled || loading}
      type={type}
    >
      {loading ? <span aria-hidden="true" className="ui-button__spinner" /> : null}
      {props.children}
    </button>
  );
}
