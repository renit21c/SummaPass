import { z } from 'zod';
export const MAX_GALLERY_IMAGES=10;
export const MAX_GALLERY_BYTES=3*1024*1024;
export const galleryFileSchema=z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/);
export const galleryImageSchema=z.object({id:z.string().uuid(),url:z.string().regex(/^\/api\/gallery\/[a-f0-9-]{36}_[a-f0-9-]{36}\.webp$/),caption:z.string().max(160),position:z.number().int().min(0)});
export const gallerySchema=z.array(galleryImageSchema).max(MAX_GALLERY_IMAGES);
export const galleryCaptionSchema=z.string().trim().max(160,'Keterangan foto maksimal 160 karakter.');
export type GalleryImage=z.infer<typeof galleryImageSchema>;
export function galleryObjectPath(file:string){const value=galleryFileSchema.parse(file);return `${value.slice(0,36)}/${value.slice(37)}`;}
export function galleryFileError(file:{size:number;type:string}){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))return 'Gunakan foto JPG, PNG, atau WebP.';
 if(!file.size)return 'File foto kosong.';
 if(file.size>MAX_GALLERY_BYTES)return 'Setiap foto maksimal 3 MB.';
 return '';
}
