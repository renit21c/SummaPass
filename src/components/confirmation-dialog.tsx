'use client';
import { ValidatedForm, FieldLabel } from '@/components/form-fields';
import { createContext,useCallback,useContext,useEffect,useId,useRef,useState,type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { AlertTriangle,CheckCircle2,X } from 'lucide-react';
import './confirmation-dialog.css';

type Options={title?:string;confirmLabel?:string;destructive?:boolean;confirmationText?:string;confirmationLabel?:string};
type Ask=(message:string,options?:Options)=>Promise<boolean>;
type Request=Options&{message:string};
const ConfirmationContext=createContext<Ask|null>(null);
export function useConfirmation(){const ask=useContext(ConfirmationContext);if(!ask)throw Error('ConfirmationProvider diperlukan.');return ask;}

export function ConfirmationProvider({children}:{children:ReactNode}){
 const [request,setRequest]=useState<Request|null>(null),[value,setValue]=useState('');
 const resolver=useRef<((accepted:boolean)=>void)|null>(null);
 const dialog=useRef<HTMLDialogElement>(null),cancel=useRef<HTMLButtonElement>(null);
 const pathname=usePathname(),id=useId();
 const finish=useCallback((accepted:boolean)=>{
  const resolve=resolver.current;resolver.current=null;
  dialog.current?.close();setRequest(null);setValue('');resolve?.(accepted);
 },[]);
 const ask=useCallback<Ask>((message,options={})=>{
  // Keep one explicit decision active; never stack destructive dialogs.
  if(resolver.current)return Promise.resolve(false);
  return new Promise(resolve=>{resolver.current=resolve;setValue('');setRequest({...options,message});});
 },[]);
 useEffect(()=>{finish(false);},[pathname,finish]);
 useEffect(()=>()=>{resolver.current?.(false);resolver.current=null;},[]);
 useEffect(()=>{
  if(!request)return;
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  dialog.current?.showModal();cancel.current?.focus();
  return()=>{document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
 },[request]);
 const valid=request?.confirmationText===undefined||value===request.confirmationText;
 return <ConfirmationContext.Provider value={ask}>{children}{request&&createPortal(
  <dialog ref={dialog} className="summa-confirmation" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={event=>{event.preventDefault();finish(false);}} onClick={event=>{if(event.target===event.currentTarget)finish(false);}}>
   <div className="summa-confirmation-content">
    <button type="button" className="summa-confirmation-close" aria-label="Tutup konfirmasi" onClick={()=>finish(false)}><X size={21} aria-hidden="true"/></button>
    <span className={`summa-confirmation-icon${request.destructive?' is-danger':''}`}>{request.destructive?<AlertTriangle size={28} aria-hidden="true"/>:<CheckCircle2 size={28} aria-hidden="true"/>}</span>
    <h2 id={`${id}-title`}>{request.title??'Konfirmasi tindakan'}</h2>
    <p id={`${id}-description`}>{request.message}</p>
    <ValidatedForm onSubmit={event=>{event.preventDefault();if(valid)finish(true);}}>
     {request.confirmationText!==undefined&&<FieldLabel className="summa-confirmation-label" htmlFor={`${id}-input`}>{request.confirmationLabel??'Ketik nama event untuk mengonfirmasi'}<strong>{request.confirmationText}</strong><input id={`${id}-input`} required value={value} onChange={event=>setValue(event.target.value)} autoComplete="off" spellCheck={false} aria-describedby={`${id}-hint`}/><small id={`${id}-hint`}>Harus sama persis, termasuk huruf besar dan kecil.</small></FieldLabel>}
     <div className="summa-confirmation-actions"><button ref={cancel} className="button button-light" type="button" onClick={()=>finish(false)}>Batal</button><button className={`button${request.destructive?' summa-confirmation-danger':''}`} type="submit" disabled={!valid}>{request.confirmLabel??'Lanjutkan'}</button></div>
    </ValidatedForm>
   </div>
  </dialog>,document.body)}</ConfirmationContext.Provider>;
}
