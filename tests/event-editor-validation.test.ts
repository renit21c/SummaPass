import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editorValidation, coverFileError, coverDimensionsError } from '../src/features/catalog/editor-validation';
const valid = () => ({ title:'Acara uji',description:'Deskripsi acara uji yang sudah cukup panjang.',category:'Musik',organizer:'Panitia',area:'Bandung',rules:'Satu tiket satu peserta.',theme:'play',startsAt:'2030-12-20T16:00',endsAt:'2030-12-20T19:00',salesStart:'2030-12-01T08:00',salesEnd:'2030-12-20T16:00',price:'75000',frontPrice:'125000',regularQuota:'24',frontQuota:'24' });
test('editor validates trimmed text and places errors on the correct fields',()=>{
 const result=editorValidation({...valid(),title:'  a  ',description:' '.repeat(25),organizer:'',area:'',rules:''});
 assert.match(result.errors.title,/3 karakter/);assert.equal(result.errors.description,'Wajib diisi.');
 for(const field of ['organizer','area','rules'])assert.ok(result.errors[field]);
 const bounds=editorValidation({...valid(),title:'a'.repeat(120),description:'a'.repeat(5000)});
 assert.equal(bounds.result.success,true);
 assert.match(editorValidation({...valid(),description:'a'.repeat(5001)}).errors.description,/5000 karakter/);
});
test('WIB dates convert safely; event end and sales order show actionable field errors',()=>{
 const result=editorValidation(valid());assert.equal(result.result.success,true);
 if(result.result.success)assert.equal(result.result.data.startsAt,'2030-12-20T09:00:00.000Z');
 assert.match(editorValidation({...valid(),endsAt:'2030-12-20T15:00'}).errors.endsAt,/setelah acara mulai/);
 assert.match(editorValidation({...valid(),salesEnd:'2030-11-30T08:00'}).errors.salesEnd,/setelah penjualan mulai/);
 assert.match(editorValidation({...valid(),salesEnd:'2030-12-20T17:00'}).errors.salesEnd,/paling lambat/);
 assert.ok(editorValidation({...valid(),startsAt:''}).errors.startsAt);
 assert.doesNotThrow(()=>editorValidation({...valid(),startsAt:'not-a-date'}));
});
test('quota bounds, blank/decimal/negative prices and custom seating match the server contract',()=>{
 assert.match(editorValidation({...valid(),regularQuota:'25'}).errors.regularQuota,/maksimal 24/);
 assert.match(editorValidation({...valid(),frontQuota:'0'}).errors.frontQuota,/minimal 1/);
 assert.match(editorValidation({...valid(),regularQuota:'1.5'}).errors.regularQuota,/bilangan bulat/);
 assert.ok(editorValidation({...valid(),price:''}).errors.price);
 assert.match(editorValidation({...valid(),price:'-1'}).errors.price,/negatif/);
 assert.match(editorValidation({...valid(),frontPrice:'3.5'}).errors.frontPrice,/bilangan bulat/);
 assert.match(editorValidation({...valid(),frontPrice:'100000001'}).errors.frontPrice,/100.000.000/);
 assert.equal(editorValidation({...valid(),price:'0',frontPrice:'0'}).result.success,true);
 assert.equal(editorValidation({...valid(),price:'',regularQuota:''},true).result.success,true);
});
test('cover rejects unsupported, empty, oversized and out-of-bounds images before upload',()=>{
 assert.match(coverFileError({type:'image/svg+xml',size:10})!,/JPG/);
 assert.match(coverFileError({type:'image/png',size:0})!,/kosong/);
 assert.match(coverFileError({type:'image/png',size:5*1024*1024+1})!,/5 MB/);
 assert.equal(coverFileError({type:'image/webp',size:5*1024*1024}),undefined);
 assert.match(coverDimensionsError(399,250)!,/400/);
 assert.match(coverDimensionsError(8000,8000)!,/24 megapiksel/);
 assert.equal(coverDimensionsError(400,250),undefined);
});
