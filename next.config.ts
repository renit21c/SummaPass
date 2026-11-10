import type { NextConfig } from 'next';
const ticketFonts=[
 './node_modules/@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-400-normal.woff',
 './node_modules/@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-700-normal.woff'
];
const config:NextConfig={
 async headers(){return [{source:'/sw.js',headers:[{key:'Cache-Control',value:'no-cache, no-store, must-revalidate'},{key:'Content-Type',value:'application/javascript; charset=utf-8'},{key:'Service-Worker-Allowed',value:'/'},{key:'Content-Security-Policy',value:"default-src 'self'; script-src 'self'"}]}];},
 turbopack:{root:process.cwd()},
 serverExternalPackages:['pdfkit'],
 outputFileTracingIncludes:{'/api/tickets/*/pdf':ticketFonts,'/api/internal/notifications/run':ticketFonts,'/api/schedules/notifications':ticketFonts,'/api/bookings/*/payment':ticketFonts,'/api/organizer/events/*/tools':ticketFonts}
};
export default config;
