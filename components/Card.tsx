import { ReactNode } from 'react';

export function Card({ title, subtitle, children, className = '', id }: { title?: string; subtitle?: string; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`card ${className}`}>
      {(title || subtitle) && <div className="card-head">
        {title && <h2>{title}</h2>}
        {subtitle && <p>{subtitle}</p>}
      </div>}
      {children}
    </section>
  );
}
