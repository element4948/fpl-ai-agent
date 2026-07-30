export function TermTip({
  children,
  description,
}: {
  children: React.ReactNode;
  description: string;
}) {
  return (
    <span
      className="term-tip"
      tabIndex={0}
      role="note"
      aria-label={`${String(children)}: ${description}`}
      data-tooltip={description}
    >
      {children}
      <span aria-hidden="true">?</span>
    </span>
  );
}
