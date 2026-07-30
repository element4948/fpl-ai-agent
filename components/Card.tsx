import { ReactNode } from 'react';

export function Card({
  title,
  subtitle,
  children,
  className = '',
  id,
  helpHref,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  id?: string;
  helpHref?: string;
}) {
  return (
    <section id={id} className={`card ${className}`}>
      {(title || subtitle) && <div className="card-head">
        <div className="card-title-row">
          {title && <h2>{title}</h2>}
          {helpHref ? (
            <a
              className="help-button"
              href={helpHref}
              aria-label={`${title || 'Section'} тайлбар нээх`}
              title="Энэ хэсгийн тайлбарыг харах"
            >
              ?
            </a>
          ) : null}
        </div>
        {subtitle && <p>{subtitle}</p>}
      </div>}
      {children}
    </section>
  );
}
