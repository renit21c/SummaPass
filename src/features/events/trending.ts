export function topSellingSlugs(sales:{slug:string;sold:number}[]):Set<string>{
 const highest=Math.max(0,...sales.map(e=>e.sold));
 return new Set(highest>0?sales.filter(e=>e.sold===highest).map(e=>e.slug):[]);
}
