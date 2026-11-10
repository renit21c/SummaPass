import { LayoutGrid, Music2, Paintbrush, UsersRound, TrendingUp } from 'lucide-react';
import './event-labels.css';

export function CategoryIcon({category,size=16}:{category:string;size?:number}){
 const Icon=category==='Musik'?Music2:category==='Workshop'?Paintbrush:category==='Keluarga'?UsersRound:LayoutGrid;
 return <Icon size={size} aria-hidden="true"/>;
}
export function CategoryLabel({category}:{category:string}){
 return <span className="event-category-label"><CategoryIcon category={category}/>{category}</span>;
}
export function TrendingBadge(){
 return <span className="event-trending-badge" title="Jumlah tiket terjual tertinggi di antara event yang sedang berlangsung atau akan datang"><TrendingUp size={15} aria-hidden="true"/>Trending</span>;
}
