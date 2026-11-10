'use client';
import { useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2,LoaderCircle,Save } from 'lucide-react';
type Profile={name:string;email:string;phone?:string;preferences?:{emailNotify?:boolean}};
export function ProfileEditor({initialUser}:{initialUser:Profile}){
 const router=useRouter();
 const initial={name:initialUser.name,email:initialUser.email,phone:initialUser.phone??'',emailNotify:initialUser.preferences?.emailNotify??true};
 const [values,setValues]=useState(initial),[baseline,setBaseline]=useState(initial);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const pending=useRef(false);
 const dirty=JSON.stringify(values)!==JSON.stringify(baseline);
 function change(field:keyof typeof values,value:string|boolean){setValues(previous=>({...previous,[field]:value}));setMessage('');setError('');}
 return <section className="profile-panel" aria-labelledby="profile-details-title">
  <div className="profile-section-heading"><h2 id="profile-details-title">Data pribadi</h2><p>Perbarui informasi kontakmu di sini.</p></div>
  <form className="profile-form" onSubmit={async event=>{
   event.preventDefault();if(pending.current||!dirty)return;
   if(!values.name.trim()){setError('Nama lengkap wajib diisi.');return;}
   pending.current=true;setBusy(true);setMessage('');setError('');
   try{
    const response=await fetch('/api/account/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...values,name:values.name.trim(),email:values.email.trim(),phone:values.phone.trim()})});
    const data=await response.json();if(!response.ok||!data.user)throw Error(data.error??'Profil belum bisa disimpan. Coba lagi.');
    const user=data.user as Profile;
    const next={name:user.name,email:user.email,phone:user.phone??'',emailNotify:user.preferences?.emailNotify??true};
    setValues(next);setBaseline(next);
    setMessage(user.email.toLowerCase()!==values.email.trim().toLowerCase()?'Profil disimpan. Perubahan email perlu dikonfirmasi melalui tautan di email.':'Perubahan profil disimpan.');
    router.refresh();
   }catch(err){setError(err instanceof Error?err.message:'Koneksi terputus. Coba lagi.');}
   finally{pending.current=false;setBusy(false);}
  }}>
   <fieldset disabled={busy}>
    <div className="profile-fields">
     <label className="profile-name-field">Nama lengkap<input name="name" autoComplete="name" required maxLength={100} value={values.name} onChange={event=>change('name',event.target.value)}/></label>
     <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} value={values.email} onChange={event=>change('email',event.target.value)} aria-describedby="profile-email-hint"/><small id="profile-email-hint">Perubahan email memerlukan konfirmasi.</small></label>
     <label>Nomor HP / WhatsApp<input name="phone" type="tel" autoComplete="tel" maxLength={30} value={values.phone} onChange={event=>change('phone',event.target.value)} placeholder="Opsional, contoh 08xxxxxxxxxx"/></label>
    </div>
    <div className="profile-preferences"><h3>Pengingat email</h3><label className="profile-check"><input type="checkbox" checked={values.emailNotify} onChange={event=>change('emailNotify',event.target.checked)}/><span><strong>Terima pengingat acara</strong><small>Kami kirim ke email akunmu.</small></span></label></div>
    <div className="profile-save-row"><span>{dirty?'Ada perubahan yang belum disimpan.':'Tidak ada perubahan.'}</span><button className="button" type="submit" disabled={busy||!dirty}>{busy?<LoaderCircle size={18} className="spin"/>:<Save size={18}/>}{busy?'Menyimpan...':'Simpan perubahan'}</button></div>
   </fieldset>
   {message&&<p className="profile-success" role="status"><CheckCircle2 size={18}/>{message}</p>}
   {error&&<p className="form-error" role="alert">{error}</p>}
  </form>
 </section>;
}
