'use client';
import { FieldLabel, ValidatedForm } from '@/components/form-fields';

import { Children, cloneElement, createContext, isValidElement, useContext, useRef, useState, type ReactNode, type ReactElement, type InputHTMLAttributes } from 'react';
import { LoaderCircle } from 'lucide-react';
import { fieldValidationMessage } from './form-validation';
import './auth-form.css';

type Feedback = { errors: Record<string,string>; matches: boolean };
const FeedbackContext = createContext<Feedback>({ errors: {}, matches: false });

export function AuthField({ label, children }: { label: string; children: ReactNode }) {
  const { errors, matches } = useContext(FeedbackContext);
  const input = Children.toArray(children).find(isValidElement) as ReactElement<InputHTMLAttributes<HTMLInputElement>> | undefined;
  const name = input?.props.name ?? '';
  const id = `auth-${name}`;
  const error = errors[name];
  return <FieldLabel htmlFor={id}>{label}{input && cloneElement(input, { id, 'aria-invalid': Boolean(error), 'aria-describedby': error || (name === 'confirmPassword' && matches) ? `${id}-feedback` : undefined })}
    <span aria-live="polite">{error ? <small id={`${id}-feedback`} className="auth-field-error">{error}</small> : name === 'confirmPassword' && matches ? <small id={`${id}-feedback`} className="auth-field-success">Kata sandi cocok.</small> : null}</span>
  </FieldLabel>;
}

export function AuthForm({ action, children }: { action: string; children: ReactNode }) {
  const [pending,setPending] = useState(false);
  const [errors,setErrors] = useState<Record<string,string>>({});
  const [message,setMessage] = useState('');
  const [matches,setMatches] = useState(false);
  const locked = useRef(false);
  const submitted = useRef(false);
  function match(form: HTMLFormElement) {
    const values = new FormData(form);
    const password = String(values.get('password') ?? '');
    const confirmation = String(values.get('confirmPassword') ?? '');
    setMatches(Boolean(confirmation && password === confirmation));
    return confirmation && password !== confirmation ? 'Konfirmasi kata sandi belum cocok.' : '';
  }
  return <FeedbackContext.Provider value={{ errors, matches }}><ValidatedForm action={action} method="post" className="auth-form" noValidate aria-busy={pending}
    onInput={event => {
      const target = event.target as HTMLInputElement;
      setMessage('');
      const mismatch = match(event.currentTarget);
      if (!submitted.current) return;
      const confirmation = event.currentTarget.elements.namedItem('confirmPassword');
      const confirmationError = confirmation instanceof HTMLInputElement ? fieldValidationMessage(confirmation) || mismatch : '';
      setErrors(previous => { const next = { ...previous }; const message = fieldValidationMessage(target); if (message) next[target.name] = message; else delete next[target.name]; if (target.name === 'password' || target.name === 'confirmPassword') { if (confirmationError) next.confirmPassword = confirmationError; else delete next.confirmPassword; } return next; });
    }}
    onSubmit={async event => {
      event.preventDefault(); if (locked.current) return;
      submitted.current = true;
      const form = event.currentTarget;
      const invalid: Record<string,string> = {};
      for (const element of Array.from(form.elements)) {
        if (!(element instanceof HTMLInputElement) || element.type === 'hidden') continue;
        const message = fieldValidationMessage(element);
        if (message) invalid[element.name] = message;
      }
      const mismatch = match(form); if (mismatch) invalid.confirmPassword = mismatch;
      setErrors(invalid); setMessage('');
      if (Object.keys(invalid).length) { form.querySelector<HTMLInputElement>(`[name="${Object.keys(invalid)[0]}"]`)?.focus(); return; }
      const submitter = (event.nativeEvent as SubmitEvent).submitter;
      const body = new FormData(form);
      if (submitter instanceof HTMLButtonElement && submitter.name) body.set(submitter.name,submitter.value);
      locked.current = true; setPending(true);
      let navigating = false;
      try {
        const response = await fetch(action,{ method:'POST',body });
        const destination = new URL(response.url);
        const error = destination.searchParams.get('error');
        if (error) {
          const login = action.endsWith('/login');
          const text = login ? 'Email atau kata sandi belum cocok. Periksa kembali.' : error === 'invalid_email' ? 'Format email tidak valid.' : error === 'email_not_registered' ? 'Email tidak terdaftar.' : error;
          if (login) setErrors({ email:text, password:text });
          else if (/sandi|password/i.test(text)) setErrors({ password:text });
          else if (/email/i.test(text)) setErrors({ email:text });
          else setMessage(text);
          return;
        }
        if (!response.ok) { const data = await response.json().catch(() => ({})); throw Error(data.error ?? 'Permintaan gagal. Coba lagi.'); }
        if (!response.redirected) throw Error('Permintaan belum selesai. Coba lagi.');
        navigating = true;
        window.location.assign(destination.pathname + destination.search + destination.hash);
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Koneksi terputus. Coba lagi.'); }
      finally { if (!navigating) { locked.current = false; setPending(false); } }
    }}>
    <fieldset disabled={pending} className="auth-fields">{children}</fieldset>
    {pending && <p className="auth-submit-status" role="status"><LoaderCircle size={18} className="spin" aria-hidden="true"/>Memproses...</p>}
    {message && <p className="form-error" role="alert">{message}</p>}
  </ValidatedForm></FeedbackContext.Provider>;
}
