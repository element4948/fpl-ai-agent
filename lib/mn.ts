// Mongolian localisation for Telegram alerts. The notification BODY is in
// Mongolian; the concise ORIGINAL source snippet (English) is attached
// untranslated so the reader can verify the primary source. We translate offline
// (no external API) — FPL's own `news`/status field is semi-structured, so a
// phrase translator covers the vast majority of real cases; anything unknown
// falls back to the English source, which we attach anyway.

// Body-part / injury phrases → Mongolian (genitive form, so "<x> гэмтэл" reads
// naturally). Case-insensitive whole-word match on "<part> injury".
const INJURY_PARTS: Array<[RegExp, string]> = [
    [/hamstring/i, 'Гуяны шөрмөсний'],
    [/knee/i, 'Өвдөгний'],
    [/ankle/i, 'Шагайны'],
    [/groin/i, 'Цавины'],
    [/calf/i, 'Тугалын'],
    [/thigh/i, 'Гуяны'],
    [/achilles/i, 'Ахиллесын шөрмөсний'],
    [/foot/i, 'Хөлийн'],
    [/back/i, 'Нурууны'],
    [/shoulder/i, 'Мөрний'],
    [/\bhip\b/i, 'Хонгоны'],
    [/muscle/i, 'Булчингийн'],
    [/wrist/i, 'Бугуйн'],
    [/finger/i, 'Хурууны'],
    [/rib/i, 'Хавирганы'],
    [/chest/i, 'Цээжний'],
    [/toe/i, 'Хөлийн хурууны'],
    [/elbow/i, 'Тохойн'],
    [/head/i, 'Толгойн'],
];

// Whole-phrase mappings applied to a single segment (a chunk split on " - ").
function translateSegment(seg: string): string {
    const s = seg.trim();
    if (!s) return '';
    const lower = s.toLowerCase();

    // "75% chance of playing"
    const chance = s.match(/(\d+)\s*%\s*chance of playing/i);
    if (chance) return `${chance[1]}% тоглох магадлал`;

    // "Expected back 25 Dec" / "Expected back around 25 Dec"
    const back = s.match(/expected back\s+(?:around\s+)?(.+)/i);
    if (back) return `≈${back[1].trim()} сэргэнэ гэж таамаглаж байна`;

    if (/unknown return date/i.test(lower)) return 'Сэргэх хугацаа тодорхойгүй';
    if (/suspended|suspension/i.test(lower)) return 'Тэмцээнээс хол (шийтгэл)';
    if (/concussion/i.test(lower)) return 'Тархины доргилтын гэмтэл';
    if (/illness|ill\b|virus|sick/i.test(lower)) return 'Өвчлөл';
    if (/knock/i.test(lower)) return 'Бага зэргийн цохилт (knock)';
    if (/lacks match fitness|match fitness/i.test(lower)) return 'Тамирын бэлтгэл дутмаг';
    if (/not fully fit|not match fit/i.test(lower)) return 'Бүрэн эрүүл биш';
    if (/on loan|loan\b/i.test(lower)) return 'Түр гэрээ (loan)';
    if (/transferred|joined|signs for|signed for/i.test(lower)) return 'Өөр багт шилжсэн';
    if (/international duty/i.test(lower)) return 'Шигшээгийн үүрэг';
    if (/doubt|doubtful/i.test(lower)) return 'Эргэлзээтэй';
    if (/rested|rotation/i.test(lower)) return 'Амраасан / ротаци';

    // "<part> injury" — translate the body part, keep "гэмтэл".
    if (/injury|injured|strain|problem/i.test(lower)) {
        for (const [re, mn] of INJURY_PARTS) {
            if (re.test(lower)) return `${mn} гэмтэл`;
        }
        return 'Гэмтэл';
    }

    // Unknown segment: leave as-is (the English source is attached separately).
    return s;
}

/** Translate an FPL `news` / status string to Mongolian (best-effort, offline). */
export function mnFplNews(news: string): string {
    if (!news || !news.trim()) return '';
    return news
        .split(/\s+[-–]\s+/)
        .map((seg) => translateSegment(seg))
        .filter(Boolean)
        .join(' — ');
}

/** Mongolian label for an external-news category. */
export function mnCategory(category?: string): string {
    switch (category) {
        case 'injury':
            return 'Гэмтлийн мэдээ';
        case 'transfer':
            return 'Шилжилт хөдөлгөөний мэдээ';
        case 'rotation':
            return 'Ротацийн мэдээ';
        case 'availability':
            return 'Бэлэн байдлын мэдээ';
        case 'international':
            return 'Шигшээгийн мэдээ';
        case 'friendly':
            return 'Нөхөрсөг тоглолтын мэдээ';
        case 'fatigue':
            return 'Ачааллын мэдээ';
        default:
            return 'Мэдээ';
    }
}

/** Mongolian label for an FPL availability status code. */
export function mnStatus(status?: string): string {
    switch (status) {
        case 'i':
            return 'Гэмтэлтэй';
        case 's':
            return 'Шийтгэлтэй (тоглохгүй)';
        case 'o':
            return 'Бэлэн бус';
        case 'd':
            return 'Эргэлзээтэй';
        case 'u':
            return 'Багт алга';
        default:
            return 'Бэлэн байдал өөрчлөгдсөн';
    }
}

/**
 * Compose a Mongolian line with its concise, UNTRANSLATED English source
 * attached: "<mn> · эх: <source> (<name>)". If there is no source text, just the
 * Mongolian part is returned.
 */
export function withSource(mn: string, source?: string, sourceName?: string): string {
    const src = (source || '').trim();
    if (!src) return mn;
    const name = sourceName ? ` (${sourceName})` : '';
    return `${mn} · эх: ${src}${name}`;
}
