type ValidationField = {
  value: string; required?: boolean; disabled?: boolean; willValidate?: boolean;
  type?: string; minLength?: number; min?: string; max?: string;
  validationMessage?: string; validity: Partial<ValidityState>;
};

export function fieldValidationMessage(field: ValidationField): string {
  if (field.disabled || field.willValidate === false) return '';
  const state = field.validity;
  if (state.valueMissing || (field.required && !field.value.trim())) return 'Wajib diisi.';
  if (state.badInput) return 'Masukkan angka yang valid.';
  if (state.typeMismatch) return field.type === 'email' ? 'Masukkan alamat email yang valid.' : 'Periksa format isian.';
  if (state.tooShort || (field.value && field.minLength && field.minLength > 0 && field.value.length < field.minLength)) return `Minimal ${field.minLength} karakter.`;
  if (state.tooLong) return 'Isian terlalu panjang.';
  if (state.rangeUnderflow) return `Minimal ${field.min}.`;
  if (state.rangeOverflow) return `Maksimal ${field.max}.`;
  if (state.stepMismatch) return 'Gunakan angka sesuai kelipatan yang diminta.';
  if (state.patternMismatch) return 'Periksa format isian.';
  if (state.customError) return field.validationMessage || 'Periksa isian ini.';
  return '';
}
