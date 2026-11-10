import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const source=fileURLToPath(new URL('../public/pwa/icon-source.svg',import.meta.url));
for(const [name,size] of [['icon-192.png',192],['icon-512.png',512],['icon-maskable-512.png',512],['apple-touch-icon.png',180]]){
 await sharp(source).resize(size,size).removeAlpha().png().toFile(fileURLToPath(new URL('../public/pwa/'+name,import.meta.url)));
 console.log('Generated '+name);
}
