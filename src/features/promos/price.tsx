import { rupiah } from '../events/data';
import './promos.css';
export function DiscountPrice({price,originalPrice,className=''}:{price:number;originalPrice?:number;className?:string}){
 const discounted=originalPrice!==undefined&&originalPrice>price;
 return <span className={`discount-price ${className}`}>
  {discounted&&<span className="discount-price-before"><span className="sr-only">Harga awal </span><del>{rupiah(originalPrice)}</del></span>}
  <strong><span className="sr-only">{discounted?'Harga setelah diskon ':'Harga '}</span>{rupiah(price)}</strong>
 </span>;
}
