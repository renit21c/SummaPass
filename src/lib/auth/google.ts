import { safeReturnPath } from './config';

export function googleOAuthOptions(origin:string,returnTo:unknown){
 const callback=new URL('/auth/callback',origin);
 callback.searchParams.set('flow','google');
 callback.searchParams.set('next',safeReturnPath(returnTo));
 return {provider:'google' as const,options:{redirectTo:callback.toString(),skipBrowserRedirect:true,scopes:'openid email profile',queryParams:{prompt:'select_account'}}};
}

type CallbackClient={auth:{exchangeCodeForSession(code:string):Promise<{error:unknown}>}};
// Email verification/recovery also use this endpoint. Only the Google flow
// resolves a workspace from the authenticated session's database assignments.
export async function exchangeAuthCallback(params:URLSearchParams,client:CallbackClient,googleDestination:(next:string)=>Promise<string|null>){
 const code=params.get('code');
 if(params.has('error')||!code||code.length>4096)return null;
 const {error}=await client.auth.exchangeCodeForSession(code);
 if(error)return null;
 const next=safeReturnPath(params.get('next'));
 return params.get('flow')==='google'?googleDestination(next):next;
}

export function loginErrorMessage(code:string){
 switch(code){
  case 'invalid':return 'Periksa format email dan isi kata sandi.';
  case 'google_unavailable':return 'Login Google belum tersedia. Gunakan email atau coba lagi nanti.';
  case 'google_cancelled':return 'Login Google dibatalkan. Kamu bisa mencoba lagi.';
  case 'google_failed':return 'Login Google belum berhasil. Coba lagi atau gunakan email.';
  case 'verification_failed':return 'Tautan masuk tidak valid atau sudah kedaluwarsa. Coba masuk kembali.';
  default:return 'Email atau kata sandi belum cocok. Silakan coba lagi.';
 }
}
