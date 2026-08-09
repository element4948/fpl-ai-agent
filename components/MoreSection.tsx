import type { ReactNode } from 'react';

export function MoreSection({
    title,
    summary,
    children,
    id,
}: {
    title: string;
    summary: string;
    children: ReactNode;
    id?: string;
}) {
    return (
        <details className="more-section" id={id}>
            <summary>
                <div>
                    <strong>{title}</strong>
                    <span>{summary}</span>
                </div>
                <b>Дэлгэрэнгүй</b>
            </summary>
            <div className="more-section-body">{children}</div>
        </details>
    );
}
