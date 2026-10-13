import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Label } from './label';
import { Input } from './input';
import { Textarea } from './textarea';
import { cn } from '../../lib/utils';

interface FieldProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}

export const Field = ({ id, label, hint, error, optional, children }: FieldProps) => (
  <div className="field grid min-w-0 gap-1.5">
    <Label className="label-row flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)]" htmlFor={id}>
      <span>{label}</span>
      {optional ? <span className="font-normal text-[var(--color-muted)]">Optional</span> : null}
    </Label>
    {children}
    {error ? (
      <span className="help error text-xs font-bold text-[var(--color-orange-deep)]" role="alert">
        {error}
      </span>
    ) : hint ? (
      <span className="help text-xs text-[var(--color-muted)]">{hint}</span>
    ) : null}
  </div>
);

const controlClasses = 'control min-h-11 border-[var(--color-border)] bg-[var(--color-white)] text-[var(--color-ink)] placeholder:text-[var(--color-muted)] focus-visible:border-[var(--color-blue-deep)] focus-visible:ring-[var(--color-blue-soft)]';

export const TextInput = ({ className = '', error, ...props }: InputHTMLAttributes<HTMLInputElement> & { error?: string }) => (
  <Input className={cn(controlClasses, error && 'error border-[var(--color-orange-deep)]', className)} aria-invalid={Boolean(error) || undefined} {...props} />
);

export const TextArea = ({ className = '', error, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string }) => (
  <Textarea className={cn(controlClasses, 'textarea min-h-32 resize-y', error && 'error border-[var(--color-orange-deep)]', className)} aria-invalid={Boolean(error) || undefined} {...props} />
);

export const Select = ({ className = '', error, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { error?: string }) => (
  <select className={cn(controlClasses, 'rounded-lg px-3 py-2', error && 'error border-[var(--color-orange-deep)]', className)} aria-invalid={Boolean(error) || undefined} {...props}>
    {children}
  </select>
);
