'use client';

import { Children, cloneElement, createContext, isValidElement, useContext, useEffect, useId, useState, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { fieldValidationMessage } from './form-validation';
import './form-fields.css';

const FormFeedback = createContext({ attempted: false, customValidation: false, reset: 0 });
type ElementProps = Record<string, unknown> & { children?: ReactNode; required?: boolean; className?: string };
const element = (node: ReactNode): node is ReactElement<ElementProps> => isValidElement(node);
function requiredIn(nodes: ReactNode): boolean {
  return Children.toArray(nodes).some(node => element(node) && (node.props.required === true || requiredIn(node.props.children)));
}
function controlIn(node: ReactNode): boolean {
  return element(node) && (['input', 'select', 'textarea'].includes(String(node.type)) || node.props.required !== undefined || Children.toArray(node.props.children).some(controlIn));
}
function markerIn(nodes: ReactNode): boolean {
  return Children.toArray(nodes).some(node => element(node) && (node.props.className?.split(' ').includes('required-mark') || markerIn(node.props.children)));
}
export function RequiredMark() { return <span className="required-mark" aria-hidden="true">*</span>; }

export function FieldLabel({ children, onInvalidCapture, onInputCapture, onChangeCapture, className, ...props }: ComponentProps<'label'>) {
  const context = useContext(FormFeedback);
  const errorId = useId();
  const [error, setError] = useState('');
  const [validated, setValidated] = useState(false);
  useEffect(() => { setError(''); setValidated(false); }, [context.reset]);
  function inspect(target: EventTarget) {
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) setError(fieldValidationMessage(target));
  }
  const parts = Children.toArray(children);
  let content: ReactNode = parts;
  if (requiredIn(children) && !markerIn(children)) {
    const firstControl = parts.findIndex(controlIn);
    if (firstControl > 0) content = [<span className="field-label-text" key="label">{parts.slice(0, firstControl)} <RequiredMark/></span>, ...parts.slice(firstControl)];
    else {
      const textIndex = parts.findIndex(node => !controlIn(node) && (typeof node === 'string' ? !!node.trim() : element(node)));
      if (textIndex >= 0) content = parts.map((node, i) => i === textIndex ? <span className="field-label-text" key="label">{node} <RequiredMark/></span> : node);
    }
  }
  function withError(nodes: ReactNode): ReactNode {
    return Children.map(nodes, node => {
      if (!element(node)) return node;
      if (controlIn(node) && (['input', 'select', 'textarea'].includes(String(node.type)) || node.props.required !== undefined)) {
        return error ? cloneElement(node, { 'aria-invalid': true, 'aria-describedby': [node.props['aria-describedby'], errorId].filter(Boolean).join(' ') }) : node;
      }
      return node.props.children ? cloneElement(node, {}, withError(node.props.children)) : node;
    });
  }
  return <label {...props} className={[className, error ? 'has-field-error' : ''].filter(Boolean).join(' ') || undefined}
    onInvalidCapture={event => { onInvalidCapture?.(event); if (context.customValidation) return; event.preventDefault(); setValidated(true); inspect(event.target); }}
    onInputCapture={event => { onInputCapture?.(event); if (!context.customValidation && (context.attempted || validated)) inspect(event.target); }}
    onChangeCapture={event => { onChangeCapture?.(event); if (!context.customValidation && (context.attempted || validated)) inspect(event.target); }}>
    {withError(content)}
    {error && <small id={errorId} className="form-field-error" aria-live="polite">{error}</small>}
  </label>;
}

export function ValidatedForm({ noValidate = false, onSubmit, onReset, children, ...props }: ComponentProps<'form'>) {
  const [attempted, setAttempted] = useState(false);
  const [reset, setReset] = useState(0);
  return <FormFeedback.Provider value={{ attempted, customValidation: noValidate, reset }}>
    <form {...props} noValidate onReset={event => { onReset?.(event); setAttempted(false); setReset(v => v + 1); }}
      onSubmit={event => {
        setAttempted(true);
        if (!noValidate) {
          const fields = Array.from(event.currentTarget.elements).filter(field => field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement);
          const invalid = fields.filter(field => fieldValidationMessage(field));
          if (invalid.length) {
            event.preventDefault();
            for (const field of invalid) field.dispatchEvent(new Event('invalid', { cancelable: true }));
            invalid[0].focus();
            return;
          }
        }
        onSubmit?.(event);
      }}>{children}</form>
  </FormFeedback.Provider>;
}
