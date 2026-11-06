'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { notificationPage,type NotificationItem } from './core';
export type { NotificationItem } from './core';
const changed='summapass_notifications_changed';
export function useNotifications(){
 const [items,setItems]=useState<NotificationItem[]>([]),[unreadCount,setUnreadCount]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const revision=useRef(0);
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  const current=++revision.current;
  try{const response=await fetch('/api/notifications?limit=100',{cache:'no-store',signal});if(signal?.aborted||current!==revision.current)return;if(response.status===401){setItems([]);setUnreadCount(0);setError('');return;}if(!response.ok)throw Error('Notifikasi belum dapat dimuat.');const data=notificationPage.parse(await response.json());if(signal?.aborted||current!==revision.current)return;setItems(data.items);setUnreadCount(data.unreadCount);setError('');}
  catch(e){if(!signal?.aborted&&current===revision.current)setError('Notifikasi belum dapat dimuat. Coba lagi.');}
  finally{if(!signal?.aborted&&current===revision.current)setLoading(false);}
 },[]);
 useEffect(()=>{const controller=new AbortController();const update=()=>{void refresh(controller.signal);};update();const timer=setInterval(update,30000);window.addEventListener(changed,update);window.addEventListener('focus',update);return()=>{controller.abort();clearInterval(timer);window.removeEventListener(changed,update);window.removeEventListener('focus',update);};},[refresh]);
 const update=async(action:'read'|'read_all'|'clear',id?:string)=>{try{const response=await fetch('/api/notifications',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id})});if(!response.ok)throw Error('Notifikasi belum dapat diperbarui.');window.dispatchEvent(new Event(changed));}catch(e){setError(e instanceof Error?e.message:'Notifikasi belum dapat diperbarui.');}};
 return {items,unreadCount,loading,error,refresh:()=>refresh(),markAsRead:(id:string)=>{void update('read',id);},markAllAsRead:()=>{void update('read_all');},clearNotifications:()=>{void update('clear');}};
}
