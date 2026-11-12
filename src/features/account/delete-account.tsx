'use client';
import { ValidatedForm, FieldLabel } from '@/components/form-fields';
import { useState } from 'react';
import { Trash2,Eye,EyeOff } from 'lucide-react';
import { useConfirmation } from '@/components/confirmation-dialog';
export function DeleteAccount({mode}:{mode:'demo'|'supabase'}){
 const confirm=useConfirmation();
 const [password,setPassword]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function remove(e:React.FormEvent){
  e.preventDefault();if(busy)return;setError('');
  if(!await confirm('Kamu tidak bisa masuk lagi atau membuka tiket dari akun ini. Reservasi yang belum dibayar dibatalkan. Riwayat transaksi, peserta, dan audit tetap disimpan untuk operasional acara. Tindakan ini tidak dapat dibatalkan.',{title:'Hapus akun?',confirmLabel:'Lanjutkan',destructive:true}))return;
  if(!await confirm('Pastikan kamu sudah menyimpan tiket yang diperlukan. Penghapusan akun tidak memproses refund.',{title:'Konfirmasi hapus akun',confirmLabel:'Hapus akun',confirmationText:'HAPUS AKUN',confirmationLabel:'Ketik HAPUS AKUN untuk mengonfirmasi',destructive:true}))return;
  setBusy(true);
  try{
   const r=await fetch('/api/account/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation:'HAPUS AKUN',...(mode==='supabase'?{password}:{})})});
   const result=await r.json();if(!r.ok)throw Error(result.error??'Akun belum dapat dihapus.');
   try{localStorage.removeItem('summapass_favorites');}catch{}
   setPassword('');window.location.replace('/login?accountDeleted=1');
  }catch(e){setError(e instanceof Error?e.message:'Akun belum dapat dihapus.');setBusy(false);}
 }
 return <section className="profile-delete-account" aria-labelledby="delete-account-heading"><h2 id="delete-account-heading">Hapus akun</h2><p>Akses akun dan profil dihapus. Riwayat transaksi serta audit acara tetap tersimpan. Tindakan ini tidak dapat dibatalkan.</p>
  <ValidatedForm onSubmit={e=>void remove(e)}><fieldset disabled={busy}>
   {mode==='supabase'&&<FieldLabel htmlFor="delete-account-password">Kata sandi saat ini<div className="profile-delete-password"><input id="delete-account-password" type={visible?'text':'password'} autoComplete="current-password" required maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" aria-label={visible?'Sembunyikan kata sandi':'Tampilkan kata sandi'} onClick={()=>setVisible(v=>!v)}>{visible?<EyeOff size={20}/>:<Eye size={20}/>}</button></div></FieldLabel>}
   {mode==='demo'&&<p>Mode demo: sesi akun demo ini akan dihapus.</p>}
   <button className="button profile-danger-button" type="submit"><Trash2 size={18} aria-hidden="true"/>{busy?'Menghapus akun...':'Hapus akun'}</button>
  </fieldset></ValidatedForm>{error&&<p className="form-error" role="alert">{error}</p>}
 </section>;
}
