import { Card } from '@/components/Card';
import { MoreSection } from '@/components/MoreSection';

type Any = any;

export function SeasonRoadmapCard({ roadmap }: { roadmap: Any }) {
    const weeks = roadmap?.weeks || [];
    return (
        <MoreSection title="Season Roadmap" summary="Дараагийн 3–8 Gameweek-ийн captain, transfer болон chip төлөвлөгөө">
        <Card
            title="Season Roadmap (3–8 Gameweek төлөвлөгөө)"
            subtitle="team xP = captain multiplier ороогүй гарааны 11-ийн таамаг оноо. Transfer watch = шууд солих тушаал биш, ажиглах shortlist."
            helpHref="/docs#roadmap"
        >
            {weeks.length ? (
                <div className="roadmap-week-grid">
                    {weeks.map((week: Any) => (
                        <div className={`roadmap-week roadmap-${week.action}`} key={week.eventId}>
                            <div className="roadmap-week-head">
                                <strong>GW{week.eventId}</strong>
                                <span>{week.formation}</span>
                                <b title="Captain multiplier ороогүй, санал болгосон Starting XI-ийн нийлбэр таамаг оноо.">{week.projectedPoints} team xP</b>
                            </div>
                            <div className="roadmap-week-main">
                                <span>Captain</span>
                                <strong>{week.captain?.name || 'TBD'}</strong>
                                <small>{week.captain ? `${week.captain.projectedPoints.toFixed(1)} xP · тухайн GW-д авах таамаг оноо` : 'Data хүлээж байна'}</small>
                            </div>
                            {week.captainAlternatives?.length ? (
                                <div className="roadmap-captain-alts">
                                    <small>Өөр captain сонголт</small>
                                    {week.captainAlternatives.map((player: Any) => (
                                        <span key={player.id}>{player.name} {player.projectedPoints.toFixed(1)} · −{player.gap}</span>
                                    ))}
                                </div>
                            ) : null}
                            <p>{week.note}</p>
                            {week.transferWatch?.length ? (
                                <div className="roadmap-watch">
                                    <small title="Энэ бол шууд transfer тушаал биш. Мэдээ, минут, төсөв батлагдвал авч үзэх shortlist.">Transfer watch · зөвхөн ажиглах жагсаалт</small>
                                    {week.transferWatch.map((player: Any) => (
                                        <span key={player.id}>{player.name} · {player.projectedPoints.toFixed(1)}</span>
                                    ))}
                                </div>
                            ) : null}
                            <div className="roadmap-flags">
                                {week.doublePlayers ? <span>DGW {week.doublePlayers}</span> : null}
                                {week.blankPlayers ? <span>Blank {week.blankPlayers}</span> : null}
                                <span>{week.action === 'hold' ? 'Roll / hold' : week.action === 'consider-chip' ? 'Chip watch' : 'Transfer watch'}</span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="notice">3–8 Gameweek fixture data нийтлэгдсэний дараа roadmap автоматаар гарна.</div>
            )}
            {roadmap?.limitations?.length ? (
                <div className="roadmap-limitations">
                    {roadmap.limitations.map((item: string) => <span key={item}>! {item}</span>)}
                </div>
            ) : null}
        </Card>
        </MoreSection>
    );
}
