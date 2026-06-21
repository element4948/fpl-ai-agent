export function Metric({ label, value, tone = '' }: { label: string; value: any; tone?: 'good' | 'bad' | '' }) {
  return <div className="metric"><span>{label}</span><strong className={tone}>{value ?? '—'}</strong></div>;
}
