import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface FieldProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}

export const Field = ({ id, label, hint, error, optional, children }: FieldProps) => (
  <div className="field">
    <label className="label-row" htmlFor={id}>
      <span>{label}</span>
      {optional ? <span>Optional</span> : null}
    </label>
    {children}
    {error ? (
      <span className="help error" role="alert">
        {error}
      </span>
    ) : hint ? (
      <span className="help">{hint}</span>
    ) : null}
  </div>
);

export const TextInput = ({ className = '', error, ...props }: InputHTMLAttributes<HTMLInputElement> & { error?: string }) => (
  <input className={`control ${error ? 'error' : ''} ${className}`.trim()} aria-invalid={Boolean(error) || undefined} {...props} />
);

export const TextArea = ({ className = '', error, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string }) => (
  <textarea className={`control textarea ${error ? 'error' : ''} ${className}`.trim()} aria-invalid={Boolean(error) || undefined} {...props} />
);

export const Select = ({ className = '', error, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { error?: string }) => (
  <select className={`control ${error ? 'error' : ''} ${className}`.trim()} aria-invalid={Boolean(error) || undefined} {...props} />
);
