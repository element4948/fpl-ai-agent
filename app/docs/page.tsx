export const dynamic = 'force-static';

const sections = [
  ['overview', 'Тойм'],
  ['purpose', 'Яагаад бүтээсэн бэ?'],
  ['outcome', 'Ямар үр дүнд хүрэх вэ?'],
  ['start', 'Эхлэх тохиргоо'],
  ['weekly', 'Gameweek бүрийн ажиллагаа'],
  ['dashboard', 'Dashboard тайлбар'],
  ['decision', 'AI шийдвэрийг унших'],
  ['risk', 'Risk ба Confidence'],
  ['team', 'My Team'],
  ['league', 'Mini League'],
  ['chips', 'Chip стратеги'],
  ['attention', 'Юуг анхаарах вэ?'],
  ['status', 'Одоогийн боломжууд'],
  ['roadmap', 'Хөгжүүлэлтийн зам'],
  ['glossary', 'Нэр томьёо'],
  ['faq', 'Түгээмэл асуулт'],
] as const;

function Term({ en, mn }: { en: string; mn: string }) {
  return <span className="term"><b>{en}</b><span>{mn}</span></span>;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return <div className="doc-step"><span>{n}</span><div><h3>{title}</h3><p>{children}</p></div></div>;
}

export default function DocsPage() {
  return <div className="docs-shell">
    <aside className="docs-sidebar">
      <a className="docs-brand" href="/">⚽ AI Agent</a>
      <div className="docs-kicker">Documentation Center (Гарын авлагын төв)</div>
      <nav>
        {sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </nav>
      <a className="docs-back" href="/">← Dashboard (Үндсэн самбар)</a>
    </aside>

    <main className="docs-main">
      <header className="docs-hero" id="overview">
        <span className="eyebrow">AI Agent Master Guide v2.0</span>
        <h1>AI Agent-ийг ойлгож, зөв ашиглах гарын авлага</h1>
        <p>Энэ хуудас нь AI Agent ямар зорилготой, хэрэглэгч систем дээр юу хийх, ямар мэдээлэл харах, юунд болгоомжлох, эцэст нь ямар үр дүнд хүрэх ёстойг нэг дор тайлбарлана.</p>
        <div className="docs-callout"><b>Үндсэн санаа:</b> AI Agent бол зүгээр статистик харуулдаг Dashboard (үндсэн самбар) биш. Энэ нь мэдээллийг нэгтгэж, Risk (эрсдэл), Confidence (итгэлцлийн хувь), Reason (шалтгаан)-тай шийдвэр санал болгодог Decision System (шийдвэрийн систем) юм.</div>
      </header>

      <section className="doc-section" id="purpose">
        <h2>1. Яагаад AI Agent-ийг бүтээсэн бэ?</h2>
        <p>Fantasy Premier League (FPL)-д амжилт гаргахын тулд тоглолтын хуваарь, тоглогчийн форм, гэмтэл, дасгалжуулагчийн мэдэгдэл, эзэмшлийн хувь, үнэ, өрсөлдөгчдийн баг зэрэг олон мэдээллийг тогтмол судлах шаардлагатай. Энэ нь их цаг авдаг бөгөөд сэтгэл хөдлөлөөр алдаа гаргах эрсдэлтэй.</p>
        <div className="docs-grid three">
          <div className="doc-card"><h3>Цаг хэмнэх</h3><p>Олон эх сурвалжийг тусад нь шалгах ажлыг нэг дор төвлөрүүлнэ.</p></div>
          <div className="doc-card"><h3>Шийдвэрийн чанар</h3><p>Таамаг бус, өгөгдөлд тулгуурласан санал авна.</p></div>
          <div className="doc-card"><h3>Тогтвортой байдал</h3><p>Gameweek бүр ижил зарчим, ижил шалгуураар дүгнэнэ.</p></div>
        </div>
      </section>

      <section className="doc-section" id="outcome">
        <h2>2. Ямар үр дүнд хүрэх ёстой вэ?</h2>
        <div className="docs-grid two">
          <div className="doc-card good-card"><h3>Хүлээгдэж буй үр дүн</h3><ul><li>Overall Rank (ерөнхий байр) тогтвортой сайжрах</li><li>Mini League (дотоод лиг)-ийн байраа ахиулах</li><li>Алдаатай Transfer (солилцоо)-ийн тоог бууруулах</li><li>Captain (ахлагч)-ын сонголтыг илүү оновчтой болгох</li><li>Судалгаанд зарцуулах хугацааг багасгах</li></ul></div>
          <div className="doc-card"><h3>Бодит хүлээлт</h3><p>AI Agent 100% зөв таахгүй. FPL нь санамсаргүй үйл явдал, гэмтэл, сэлгээ, шүүгчийн шийдвэр зэрэг таамаглах боломжгүй хүчин зүйлтэй. Системийн зорилго нь бүх шийдвэрийг зөв болгох биш, урт хугацаанд алдааны магадлалыг бууруулж, шийдвэрийн чанарыг тогтвортой өсгөх юм.</p></div>
        </div>
      </section>

      <section className="doc-section" id="start">
        <h2>3. Анх удаа ашиглахдаа юу хийх вэ?</h2>
        <Step n={1} title="Settings (Тохиргоо) нээх">Өөрийн Entry ID (FPL багийн давтагдашгүй дугаар), шаардлагатай бол League ID (лиг дугаар), Strategy (стратеги), Risk Profile (эрсдэлийн хэв маяг)-аа оруулна.</Step>
        <Step n={2} title="Entry ID оруулах">FPL сайтын URL дахь <code>/entry/1234567/</code> хэсгийн тоо нь Entry ID юм. Үүнийг оруулснаар AI Agent таны бодит багтай ажиллах боломжтой болно.</Step>
        <Step n={3} title="Хэл ба стратегиа сонгох">Монгол хэл үндсэн байна. Overall Rank (ерөнхий байр), Mini League (дотоод лиг), Balanced (тэнцвэртэй) стратегиас зорилгодоо тохируулан сонгоно.</Step>
        <Step n={4} title="Decision (шийдвэр) ажиллуулах">Dashboard дээр AI-ийн Captain, Transfer, Chip, Risk, Confidence, Reason-ийг уншина.</Step>
      </section>

      <section className="doc-section" id="weekly">
        <h2>4. Gameweek бүр юу хийх вэ?</h2>
        <div className="timeline">
          <div><b>Deadline-оос 5–7 хоногийн өмнө</b><span>Өмнөх Gameweek-ийн үр дүн, гэмтэл, дараагийн Fixture (тоглолтын хуваарь)-ийг ерөнхийд нь шалгана. Transfer яарахгүй.</span></div>
          <div><b>3–4 хоногийн өмнө</b><span>AI Agent-ийн Transfer Target (солилцооны зорилтот тоглогч), Captain Shortlist (ахлагчийн богино жагсаалт)-ийг харна.</span></div>
          <div><b>1–2 хоногийн өмнө</b><span>Press Conference (дасгалжуулагчийн хэвлэлийн хурал), Injury News (гэмтлийн мэдээ), Rotation Risk (сэлгээний эрсдэл)-ийг шалгана.</span></div>
          <div><b>Deadline өдөр</b><span>Decision-ийг дахин ажиллуулж, Captain, Vice Captain, Starting XI, Bench Order, Transfer, Chip-ээ эцэслэнэ.</span></div>
          <div><b>Deadline дараа</b><span>Шийдвэрээ буцааж өөрчлөх боломжгүй тул үр дүнг тайван ажиглаж, дараагийн Gameweek-д зориулсан тэмдэглэл хийнэ.</span></div>
        </div>
      </section>

      <section className="doc-section" id="dashboard">
        <h2>5. Dashboard (Үндсэн самбар) дээр юу харах вэ?</h2>
        <div className="docs-grid two">
          <div className="doc-card"><Term en="This Week Decision" mn="Энэ долоо хоногийн шийдвэр"/><p>AI Agent-ийн нэгтгэсэн гол санал. Strategy, Captain, Transfer, Chip болон товч дүгнэлтийг харуулна.</p></div>
          <div className="doc-card"><Term en="Captain" mn="Ахлагч"/><p>Дараагийн Gameweek-д хоёр дахин оноо авах тоглогчийн санал.</p></div>
          <div className="doc-card"><Term en="Transfer" mn="Солилцоо"/><p>Ямар тоглогчийг гаргаж, хэнийг авахыг санал болгож байгааг харуулна.</p></div>
          <div className="doc-card"><Term en="Chip" mn="Тусгай боломж"/><p>Wildcard, Free Hit, Bench Boost, Triple Captain-ийг ашиглах эсвэл хадгалах зөвлөгөө.</p></div>
          <div className="doc-card"><Term en="Top Targets" mn="Шилдэг зорилтот тоглогчид"/><p>Үнэ, форм, тоглолтын хуваарь, эрсдэлийн нийлбэр үнэлгээгээр хамгийн сонирхолтой тоглогчид.</p></div>
          <div className="doc-card"><Term en="League Intelligence" mn="Лигийн ухаалаг шинжилгээ"/><p>Таны дээр байгаа өрсөлдөгчид, онооны зөрүү, барих эсвэл гүйцэх стратегийг харуулна.</p></div>
        </div>
      </section>

      <section className="doc-section" id="decision">
        <h2>6. AI-ийн шийдвэрийг яаж унших вэ?</h2>
        <p>Шийдвэрийг зөвхөн тоглогчийн нэрээр нь бүү дага. Дараах 4 хэсгийг хамтад нь уншина.</p>
        <div className="decision-flow"><span>Recommendation<br/><small>Санал</small></span><b>→</b><span>Confidence<br/><small>Итгэлцлийн хувь</small></span><b>→</b><span>Risk<br/><small>Эрсдэл</small></span><b>→</b><span>Reason<br/><small>Шалтгаан</small></span></div>
        <div className="docs-callout"><b>Жишээ:</b> Captain — Salah, Confidence 88%, Risk 18%, Reason — Home Fixture (гэрийн тоглолт), Penalty Taker (торгуулийн цохилт гүйцэтгэгч), High Expected Minutes (өндөр тоглох магадлалтай минут). Энэ нь хүчтэй санал боловч deadline-ийн өмнөх гэмтлийн мэдээг дахин шалгах ёстой гэсэн үг.</div>
      </section>

      <section className="doc-section" id="risk">
        <h2>7. Confidence (Итгэлцлийн хувь) ба Risk (Эрсдэл)</h2>
        <div className="docs-grid two">
          <div className="doc-card"><h3>Confidence (Итгэлцлийн хувь)</h3><ul><li><b>80–100%</b> — Хүчтэй санал</li><li><b>65–79%</b> — Боломжийн, нэмэлт мэдээ шалгана</li><li><b>50–64%</b> — Тодорхой бус, хувилбаруудыг харьцуулна</li><li><b>0–49%</b> — Шууд дагахаас болгоомжилно</li></ul></div>
          <div className="doc-card"><h3>Risk (Эрсдэл)</h3><ul><li><b>0–20%</b> — Бага эрсдэл</li><li><b>21–40%</b> — Дунд эрсдэл</li><li><b>41–60%</b> — Өндөр эрсдэл</li><li><b>61%+</b> — Маш өндөр эрсдэл</li></ul></div>
        </div>
        <p className="doc-note">Confidence өндөр байсан ч Risk өндөр байж болно. Жишээ нь тогловол өндөр оноо авах магадлалтай боловч гараанд гарах эсэх нь эргэлзээтэй тоглогч.</p>
      </section>

      <section className="doc-section" id="team">
        <h2>8. My Team (Миний баг) хэсэгт юу хийх вэ?</h2>
        <ul className="check-list"><li>15 тоглогч зөв татагдсан эсэхийг шалгах</li><li>Bank (үлдсэн төсөв), Team Value (багийн нийт үнэ), Free Transfers (үнэгүй солилцоо)-ийг шалгах</li><li>Starting XI (гарааны 11), Bench Order (сэлгээний дараалал)-ын зөвлөмжийг харах</li><li>Captain болон Vice Captain-аа баталгаажуулах</li><li>Flagged Player (анхааруулгатай тоглогч)-уудыг нягтлах</li></ul>
        <div className="docs-callout">AI Agent FPL сайт дээр таны өмнөөс автоматаар transfer хийхгүй. Систем зөвлөгөө өгнө, харин эцсийн өөрчлөлтийг та албан ёсны FPL сайт дээр хийнэ.</div>
      </section>

      <section className="doc-section" id="league">
        <h2>9. Mini League (Дотоод лиг)-ийн шинжилгээ</h2>
        <p>League ID оруулсан үед AI Agent таны байр, тэргүүлэгчээс хоцорсон оноо, таны дээр байгаа менежерүүдийг шинжилнэ.</p>
        <div className="docs-grid three">
          <div className="doc-card"><h3>Common Players</h3><p>Тантай болон өрсөлдөгчтэй ижил тоглогчид. Эдгээр нь онооны зөрүүг их өөрчлөхгүй.</p></div>
          <div className="doc-card"><h3>Differential</h3><p>Цөөн эзэмшилтэй, өрсөлдөгчөөс ялгарах тоглогч. Өндөр боломжтой ч эрсдэлтэй.</p></div>
          <div className="doc-card"><h3>Captain Swing</h3><p>Ахлагчийн өөр сонголтоор богино хугацаанд онооны зөрүү өөрчлөх боломж.</p></div>
        </div>
        <p className="doc-note">Лигийн тэргүүлэгчийг гүйцэх гэж хэт олон эрсдэлтэй сонголт нэг дор хийхгүй. Gap (онооны зөрүү), үлдсэн Gameweek, багийн бүтцийг хамтад нь үнэлнэ.</p>
      </section>

      <section className="doc-section" id="chips">
        <h2>10. Chip (Тусгай боломж)-ийн үндсэн ойлголт</h2>
        <div className="glossary-table">
          <div><b>Wildcard</b><span>Хязгааргүй солилцоо хийж багаа урт хугацаанд шинэчлэх.</span></div>
          <div><b>Free Hit</b><span>Зөвхөн нэг Gameweek-д багаа түр өөрчлөөд дараа нь хуучин багтаа буцах.</span></div>
          <div><b>Bench Boost</b><span>Сэлгээний 4 тоглогчийн оноог тухайн Gameweek-д тооцуулах.</span></div>
          <div><b>Triple Captain</b><span>Ахлагчийн оноог хоёр биш гурав дахин тооцуулах.</span></div>
        </div>
        <p className="doc-note">Chip-ийг зөвхөн өндөр оноо авах боломжтой учраас биш, багийн нөхцөл, давхар Gameweek, хоосон Gameweek, тоглогчдын минут, гэмтэл зэрэгтэй уялдуулж хэрэглэнэ.</p>
      </section>

      <section className="doc-section" id="attention">
        <h2>11. Хэрэглэгч юуг анхаарах ёстой вэ?</h2>
        <div className="docs-grid two">
          <div className="doc-card warning-card"><h3>Deadline-ийн өмнө шалгах</h3><ul><li>Шинэ гэмтэл гарсан эсэх</li><li>Дасгалжуулагчийн мэдэгдэл</li><li>Тоглогчийг өөр клуб рүү шилжүүлэх мэдээ</li><li>Европын тэмцээний минут ба ядаргаа</li><li>Starting XI алдагдах эрсдэл</li></ul></div>
          <div className="doc-card warning-card"><h3>Шууд дагаж болохгүй нөхцөл</h3><ul><li>Data шинэчлэгдээгүй</li><li>Confidence бага</li><li>Risk өндөр</li><li>Шинэ мэдээ AI-д хараахан орж ирээгүй</li><li>Санал таны төсөв, үнэгүй солилцоотой зөрчилдөж байвал</li></ul></div>
        </div>
      </section>

      <section className="doc-section" id="status">
        <h2>12. Одоогийн хувилбар юу хийж чаддаг вэ?</h2>
        <div className="status-list">
          <div className="done"><b>Бэлэн</b><span>Next.js суурь, Vercel deploy, FPL bootstrap data, Draft Builder, Captain shortlist, Decision Engine v1, Risk breakdown, Confidence, тайлбар, Монгол/Англи UI.</span></div>
          <div className="partial"><b>Хэсэгчлэн бэлэн</b><span>My Team integration, Transfer Engine, Chip Planner, League Intelligence.</span></div>
          <div className="todo"><b>Дараагийн хөгжүүлэлт</b><span>News Engine, press conference signals, бодит injury/rotation layer, бүрэн weekly report, өрсөлдөгчийн багийн нарийвчилсан харьцуулалт.</span></div>
        </div>
      </section>

      <section className="doc-section" id="roadmap">
        <h2>13. AI Agent хөгжүүлэлтийн зам</h2>
        <div className="roadmap">
          <div><span>1</span><b>Foundation (Суурь)</b><p>Project, data, UI, deploy.</p></div>
          <div><span>2</span><b>AI Brain (AI тархи)</b><p>Decision, Confidence, Risk, Explain.</p></div>
          <div><span>3</span><b>My Team Intelligence</b><p>Бодит баг, гараа, сэлгээ, transfer.</p></div>
          <div><span>4</span><b>League Intelligence</b><p>Өрсөлдөгч, differential, gap strategy.</p></div>
          <div><span>5</span><b>News & Signals</b><p>Гэмтэл, press conference, rotation, fatigue.</p></div>
          <div><span>6</span><b>Weekly AI Report</b><p>Нэг дэлгэц дээр эцсийн Gameweek төлөвлөгөө.</p></div>
        </div>
      </section>

      <section className="doc-section" id="glossary">
        <h2>14. Англи нэр томьёоны Монгол тайлбар</h2>
        <div className="glossary-table">
          {[
            ['Captain','Ахлагч — оноо нь хоёр дахин тооцогдох тоглогч'],
            ['Vice Captain','Дэд ахлагч — ахлагч тоглоогүй үед орлох тоглогч'],
            ['Transfer','Солилцоо — нэг тоглогчийг гаргаж өөр тоглогч авах'],
            ['Fixture','Тоглолтын хуваарь буюу дараагийн өрсөлдөгч'],
            ['Form','Сүүлийн тоглолтуудын үзүүлэлт'],
            ['Expected Points','Хүлээгдэж буй оноо'],
            ['Expected Minutes','Тоглох магадлалтай минут'],
            ['Ownership','Тухайн тоглогчийг эзэмшиж буй менежерүүдийн хувь'],
            ['Differential','Цөөн эзэмшилтэй, ялгарах боломжтой тоглогч'],
            ['Rotation','Тоглогчийг амраах эсвэл сэлгээнд үлдээх эрсдэл'],
            ['Risk','Эрсдэл — санал биелэхгүй байх магадлал'],
            ['Confidence','Итгэлцлийн хувь — AI саналдаа хэр итгэлтэй байгааг харуулна'],
            ['Hit','Үнэгүй солилцооноос хэтэрч оноо хасуулах солилцоо'],
            ['Bank','Ашиглаагүй үлдсэн төсөв'],
            ['Team Value','Багийн нийт үнэ'],
            ['Clean Sheet','Гоол алдалгүй тоглолт дуусгах'],
            ['Gameweek','FPL-ийн нэг оноо тооцох тоглолтын үе'],
            ['Deadline','Өөрчлөлт хийх эцсийн хугацаа'],
          ].map(([a,b]) => <div key={a}><b>{a}</b><span>{b}</span></div>)}
        </div>
      </section>

      <section className="doc-section" id="faq">
        <h2>15. Түгээмэл асуулт</h2>
        <details><summary>Entry ID байхгүй бол ашиглаж болох уу?</summary><p>Болно. Pre-season draft, нийт тоглогчдын үнэлгээ, ерөнхий captain shortlist зэрэг хэсгийг ашиглаж болно. Харин таны бодит багт тохирсон зөвлөгөө хязгаарлагдана.</p></details>
        <details><summary>AI-ийн саналыг заавал дагах уу?</summary><p>Үгүй. AI Agent бол шийдвэрийн туслах. Шинэ мэдээ, таны хувийн стратеги, эрсдэлийн сонирхол зэргийг харгалзан эцсийн шийдвэрийг та гаргана.</p></details>
        <details><summary>Confidence өндөр бол заавал зөв гэсэн үг үү?</summary><p>Үгүй. Энэ нь одоо байгаа мэдээллээр санал хүчтэй гэсэн үг. Хөлбөмбөгийн санамсаргүй байдал үргэлж үлдэнэ.</p></details>
        <details><summary>Яагаад Монгол тайлбарын хажууд Англи нэр үлдээсэн бэ?</summary><p>FPL-ийн албан ёсны нэр томьёог танихад хэрэгтэй. AI Agent дээр англи нэр гарсан тохиолдолд ард нь Монгол тайлбар дагалдана.</p></details>
      </section>

      <footer className="docs-footer"><a href="/">Dashboard (Үндсэн самбар) руу буцах →</a><span>AI Agent Documentation Center v2.0</span></footer>
    </main>
  </div>;
}
