import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fieldValidationMessage as message } from '../src/components/form-validation';

test('required fields reject empty and whitespace values, while optional fields stay valid', () => {
  assert.equal(message({ value: '', required: true, validity: { valueMissing: true } }), 'Wajib diisi.');
  assert.equal(message({ value: '   ', required: true, validity: { valid: true } }), 'Wajib diisi.');
  assert.equal(message({ value: '', validity: { valid: true } }), '');
  assert.equal(message({ value: '0', required: true, validity: { valid: true } }), '');
});
test('feedback gives actionable Indonesian messages for email, text and number constraints', () => {
  assert.equal(message({ value: 'invalid', type: 'email', validity: { typeMismatch: true } }), 'Masukkan alamat email yang valid.');
  assert.equal(message({ value: 'abc', minLength: 6, validity: { valid: true } }), 'Minimal 6 karakter.');
  assert.equal(message({ value: '0', min: '1', validity: { rangeUnderflow: true } }), 'Minimal 1.');
  assert.equal(message({ value: '101', max: '100', validity: { rangeOverflow: true } }), 'Maksimal 100.');
  assert.equal(message({ value: '1.5', validity: { stepMismatch: true } }), 'Gunakan angka sesuai kelipatan yang diminta.');
});
test('disabled and non-validating controls cannot block submission', () => {
  for (const extra of [{ disabled: true }, { willValidate: false }]) {
    assert.equal(message({ value: '', required: true, validity: { valueMissing: true }, ...extra }), '');
  }
});
