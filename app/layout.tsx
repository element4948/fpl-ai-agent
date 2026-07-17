import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Agent',
  description: 'AI-powered Fantasy Premier League assistant',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="mn">
      <body>{children}</body>
    </html>
  );
}
