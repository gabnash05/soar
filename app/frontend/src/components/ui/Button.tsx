import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

interface BaseProps {
  variant?: ButtonVariant;
  children: ReactNode;
  className?: string;
}

export const Button = ({ variant = 'primary', className = '', ...props }: BaseProps & ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button className={`btn btn-${variant} ${className}`.trim()} {...props} />
);

export const ButtonLink = ({ variant = 'primary', className = '', ...props }: BaseProps & LinkProps) => (
  <Link className={`btn btn-${variant} btn-link ${className}`.trim()} {...props} />
);

export const ExternalButtonLink = ({ variant = 'secondary', className = '', ...props }: BaseProps & AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <a className={`btn btn-${variant} btn-link ${className}`.trim()} rel="noreferrer noopener" {...props} />
);
