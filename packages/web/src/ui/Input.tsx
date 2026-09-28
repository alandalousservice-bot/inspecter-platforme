import type { InputHTMLAttributes } from 'react';

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
};

export function Input({ id, label, hint, error, className = '', ...props }: InputProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId, props['aria-describedby']].filter(Boolean).join(' ') || undefined;

  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
        {props.required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        {...props}
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error ? true : props['aria-invalid']}
        className={`ui-input ${className}`.trim()}
        dir={props.dir ?? 'auto'}
      />
      {hint ? (
        <p className="ui-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="ui-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
