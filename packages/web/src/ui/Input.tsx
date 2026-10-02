import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

type FieldFrameProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
};

function FieldFrame({ id, label, hint, error, required, children }: FieldFrameProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true" className="ui-field__required"> *</span> : null}
      </label>
      {children}
      {hint ? <p className="ui-field__hint" id={hintId}>{hint}</p> : null}
      {error ? <p className="ui-field__error" id={errorId} role="alert">{error}</p> : null}
    </div>
  );
}

function fieldA11y(id: string, hint?: string, error?: string, describedBy?: string, invalid?: boolean | 'false' | 'true' | 'grammar' | 'spelling') {
  return {
    'aria-describedby': [hint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined, describedBy]
      .filter(Boolean).join(' ') || undefined,
    'aria-invalid': error ? true : invalid,
  };
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
};

export function Input({ id, label, hint, error, className = '', required, ...props }: InputProps) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} required={required}>
      <input
        {...props}
        {...fieldA11y(id, hint, error, props['aria-describedby'], props['aria-invalid'])}
        id={id}
        required={required}
        className={`ui-input ${className}`.trim()}
        dir={props.dir ?? 'auto'}
      />
    </FieldFrame>
  );
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
};

export function Select({ id, label, hint, error, className = '', required, children, ...props }: SelectProps) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} required={required}>
      <select
        {...props}
        {...fieldA11y(id, hint, error, props['aria-describedby'], props['aria-invalid'])}
        id={id}
        required={required}
        className={`ui-input ui-select ${className}`.trim()}
        dir={props.dir ?? 'auto'}
      >
        {children}
      </select>
    </FieldFrame>
  );
}

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
};

export function Textarea({ id, label, hint, error, className = '', required, ...props }: TextareaProps) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} required={required}>
      <textarea
        {...props}
        {...fieldA11y(id, hint, error, props['aria-describedby'], props['aria-invalid'])}
        id={id}
        required={required}
        className={`ui-input ui-textarea ${className}`.trim()}
        dir={props.dir ?? 'auto'}
      />
    </FieldFrame>
  );
}
