'use client';
import { dict } from '@/lib/i18n';

export function Navbar({ lang, onLang }: { lang: 'mn' | 'en'; onLang: () => void }) {
  const t = dict[lang];
  return <nav className="nav">
    <a className="brand" href="#top"><span>⚽</span> AI Agent</a>
    <div className="nav-links">
      <a href="#settings">{t.navSettings}</a>
      <a href="#team">{t.navTeam}</a>
      <a href="#league">{t.navLeague}</a>
      <a href="#drafts">{t.navDrafts}</a>
      <a href="/docs">Docs (гарын авлага)</a>
      <button className="ghost" onClick={onLang}>{lang === 'mn' ? 'EN' : 'MN'}</button>
    </div>
  </nav>;
}
