import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Button as ShadButton } from './button';
import { cn } from '../../lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

interface BaseProps {
  variant?: ButtonVariant;
  children: ReactNode;
  className?: string;
}

const variantMap: Record<ButtonVariant, ComponentProps<typeof ShadButton>['variant']> = {
  primary: 'default',
  secondary: 'outline',
  quiet: 'ghost',
  danger: 'destructive',
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'min-h-11 bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[oklch(76%_0.1663_78.4)] font-bold shadow-none',
  secondary: 'min-h-11 border-[var(--color-border)] bg-[var(--color-white)] text-[var(--color-navy)] hover:bg-[var(--color-navy-soft)] font-bold shadow-none',
  quiet: 'min-h-11 text-[var(--color-blue-deep)] hover:bg-[var(--color-blue-soft)] hover:text-[var(--color-blue-deep)] font-bold shadow-none',
  danger: 'min-h-11 bg-[var(--color-danger-soft)] text-[var(--color-orange-deep)] hover:bg-[color-mix(in_oklch,var(--color-danger-soft),var(--color-orange-deep)_12%)] font-bold shadow-none',
};

export const Button = ({ variant = 'primary', className = '', ...props }: BaseProps & ButtonHTMLAttributes<HTMLButtonElement>) => (
  <ShadButton variant={variantMap[variant]} className={cn(variantClasses[variant], className)} {...props} />
);

export const ButtonLink = ({ variant = 'primary', className = '', children, ...props }: BaseProps & LinkProps) => (
  <ShadButton asChild variant={variantMap[variant]} className={cn(variantClasses[variant], 'text-center no-underline', className)}>
    <Link {...props}>{children}</Link>
  </ShadButton>
);

export const ExternalButtonLink = ({ variant = 'secondary', className = '', children, ...props }: BaseProps & AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <ShadButton asChild variant={variantMap[variant]} className={cn(variantClasses[variant], 'text-center no-underline', className)}>
    <a rel="noreferrer noopener" {...props}>{children}</a>
  </ShadButton>
);
