import { existsSync,mkdirSync,readFileSync,writeFileSync,renameSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { catalogRoot } from '../catalog/persistence';
import { gallerySchema,type GalleryImage } from './core';
const path=join(catalogRoot,'gallery.json');
const schema=z.record(z.string().uuid(),gallerySchema);
function read(){return existsSync(path)?schema.parse(JSON.parse(readFileSync(path,'utf8'))):{};}
export function localGallery(id:string){return read()[id]??[];}
export function saveLocalGallery(id:string,images:GalleryImage[]){
 const all=read();all[id]=gallerySchema.parse(images);mkdirSync(catalogRoot,{recursive:true});
 const temporary=join(catalogRoot,'gallery.tmp');writeFileSync(temporary,JSON.stringify(all));renameSync(temporary,path);return all[id];
}
