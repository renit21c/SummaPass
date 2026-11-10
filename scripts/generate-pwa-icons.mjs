import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

const source=fileURLToPath(new URL('../public/pwa/icon-source.svg',import.meta.url));
for(const [name,size] of [['icon-192.png',192],['icon-512.png',512],['icon-maskable-512.png',512],['apple-touch-icon.png',180]]){
 await sharp(source).resize(size,size).removeAlpha().png().toFile(fileURLToPath(new URL('../public/pwa/'+name,import.meta.url)));
 console.log('Generated '+name);
}

// Keep the browser favicon based on the same ticket mark as the navigation logo.
const faviconSource=fileURLToPath(new URL('../src/app/icon.svg',import.meta.url));
const sizes=[16,32,48];
const images=await Promise.all(sizes.map(size=>sharp(faviconSource).resize(size,size).png().toBuffer()));
const directory=Buffer.alloc(6+16*images.length);
directory.writeUInt16LE(1,2);
directory.writeUInt16LE(images.length,4);
let offset=directory.length;
for(const [index,png] of images.entries()){
 const entry=6+16*index;
 directory[entry]=sizes[index];directory[entry+1]=sizes[index];
 directory.writeUInt16LE(1,entry+4);directory.writeUInt16LE(32,entry+6);
 directory.writeUInt32LE(png.length,entry+8);directory.writeUInt32LE(offset,entry+12);
 offset+=png.length;
}
await writeFile(fileURLToPath(new URL('../src/app/favicon.ico',import.meta.url)),Buffer.concat([directory,...images]));
console.log('Generated favicon.ico');
