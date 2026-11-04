import type { Event } from '@/features/events/data';
export function Poster({ event, large = false }: { event: Event; large?: boolean }) {
  if(event.coverUrl)return <div className={`poster ${large?'poster-large':''} poster-upload`}><img src={event.coverUrl} alt={`Cover ${event.title}`}/></div>;
  return <div className={`poster ${event.theme} ${large ? 'poster-large' : ''}`} aria-label={`Poster ilustrasi ${event.title}, event demo`} role="img"><div className="poster-art" aria-hidden="true"><i /><i /><i /></div><strong>{event.headline}</strong><div className="poster-bottom"><span>SUMMARECON<br />MALL BANDUNG</span><span>{new Date(event.date+'T12:00:00+07:00').toLocaleDateString('id-ID',{month:'long',year:'numeric'})}</span></div></div>;
}
