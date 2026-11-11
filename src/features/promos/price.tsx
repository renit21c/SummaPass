import { rupiah } from '../events/data';
import './promos.css';

export interface DiscountPriceProps {
  price: number;
  originalPrice?: number;
  className?: string;
  promoName?: string;
  unit?: string;
  showBadge?: boolean;
}

export function DiscountPrice({
  price,
  originalPrice,
  className = '',
  promoName,
  unit,
  showBadge = true
}: DiscountPriceProps) {
  const discounted = originalPrice !== undefined && originalPrice > price;
  const percentOff = discounted ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;

  return (
    <span className={`discount-price ${className}`}>
      {discounted && (
        <span className="discount-price-before">
          <span className="sr-only">Harga awal </span>
          <del>{rupiah(originalPrice)}</del>
          {showBadge && percentOff > 0 && (
            <span className="discount-badge" aria-label={`Diskon ${percentOff} persen`}>
              -{percentOff}%
            </span>
          )}
          {promoName && (
            <span className="discount-promo-pill" title={promoName}>
              🏷️ {promoName}
            </span>
          )}
        </span>
      )}
      <span className="discount-price-current">
        <strong>
          <span className="sr-only">{discounted ? 'Harga setelah diskon ' : 'Harga '}</span>
          {rupiah(price)}
        </strong>
        {unit && <span className="discount-unit">{unit}</span>}
      </span>
    </span>
  );
}

