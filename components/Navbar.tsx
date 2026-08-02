'use client';
import { dict } from '@/lib/i18n';

export function Navbar({ lang, onLang }: { lang: 'mn' | 'en'; onLang: () => void }) {
  const t = dict[lang];
  return <nav className="nav">
    <a className="brand" href="#top"><span>⚽</span> AI Agent</a>
    <div className="nav-links">
      <a href="#decision">Шийдвэр</a>
      <a href="#team">{t.navTeam}</a>
      <a href="#drafts">{t.navDrafts}</a>
      <details className="nav-more">
        <summary>Бусад</summary>
        <div>
          <a href="#settings">{t.navSettings}</a>
          <a href="#league">{t.navLeague}</a>
          <a href="/docs">Гарын авлага</a>
          <button className="ghost" onClick={onLang}>{lang === 'mn' ? 'English' : 'Монгол'}</button>
        </div>
      </details>
    </div>
  </nav>;
}
