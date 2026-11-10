import './page-skeleton.css';

type Variant = 'content' | 'catalog' | 'detail' | 'seats' | 'auth' | 'dashboard' | 'ticket' | 'form' | 'scanner';
function Block({ className = '' }: { className?: string }) { return <div className={`loading-block ${className}`} />; }
export function PageSkeleton({ variant = 'content' }: { variant?: Variant }) {
  return <main id="main" className={`container section page-loading page-loading-${variant}`} aria-busy="true" aria-label="Memuat halaman">
    <p className="loading-caption" role="status">Memuat halaman...</p>
    <div aria-hidden="true">
      <Block className="loading-heading"/><Block className="loading-subtitle"/>
      {variant === 'catalog' ? <><Block className="loading-toolbar"/><div className="loading-grid">{[0,1,2,3].map(i=><div key={i}><Block className="loading-poster"/><Block className="loading-line"/><Block className="loading-subtitle"/></div>)}</div></>
      : variant === 'dashboard' ? <><div className="loading-kpis">{[0,1,2,3].map(i=><Block key={i} className="loading-kpi"/>)}</div><Block className="loading-chart"/><Block className="loading-table"/></>
      : variant === 'detail' || variant === 'seats' || variant === 'ticket' || variant === 'auth' || variant === 'scanner' ? <div className="loading-split"><Block className="loading-feature"/><div><Block className="loading-line"/><Block className="loading-line"/><Block className="loading-toolbar"/><Block className="loading-toolbar"/><Block className="loading-chart"/></div></div>
      : variant === 'form' ? <div className="loading-form">{[0,1,2,3,4].map(i=><div key={i}><Block className="loading-subtitle"/><Block className="loading-toolbar"/></div>)}</div>
      : <div className="loading-list">{[0,1,2].map(i=><Block key={i} className="loading-row"/>)}</div>}
    </div>
  </main>;
}
