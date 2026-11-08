import type { NextConfig } from 'next';
const ticketFonts=[
 './node_modules/@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-400-normal.woff',
 './node_modules/@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-700-normal.woff'
];
const config:NextConfig={
 turbopack:{root:process.cwd()},
 serverExternalPackages:['pdfkit'],
 outputFileTracingIncludes:{'/api/tickets/*/pdf':ticketFonts,'/api/internal/notifications/run':ticketFonts,'/api/schedules/notifications':ticketFonts,'/api/bookings/*/payment':ticketFonts,'/api/organizer/events/*/tools':ticketFonts}
};
export default config;
