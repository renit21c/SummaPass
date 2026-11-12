'use client';

import { useState, type ComponentProps } from 'react';

type Props = Omit<ComponentProps<'input'>, 'value' | 'type'> & { value: number; type?: 'number' };

// Keep the editable text separate from the numeric model. Clearing a field must
// leave it empty, even when its parent's Number('') conversion produces zero.
export function NumberInput({ value, onChange, required = true, ...props }: Props) {
  const source = String(value);
  const [draft, setDraft] = useState({ source, text: source });
  if (draft.source !== source) setDraft({ source, text: source });
  return <input {...props} type="number" required={required} value={draft.source === source ? draft.text : source}
    onChange={event => {
      const text = event.currentTarget.value.replace(/^(-?)0+(?=\d)/, '$1');
      setDraft({ source: String(Number(event.currentTarget.value)), text });
      onChange?.(event);
    }}/>
}
