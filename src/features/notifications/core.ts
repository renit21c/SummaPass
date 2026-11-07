import { z } from 'zod';
export const notificationItem=z.object({id:z.string().uuid(),title:z.string(),message:z.string(),type:z.enum(['ticket','booking','reminder','announcement']),date:z.string().datetime({offset:true}),read:z.boolean(),link:z.string().regex(/^\/(?!\/)/).optional()});
export type NotificationItem=z.infer<typeof notificationItem>;
export const notificationPage=z.object({items:z.array(notificationItem),unreadCount:z.number().int().min(0),nextCursor:z.string().uuid().nullable()});
export const notificationPreferences=z.object({bookingReminders:z.boolean(),eventReminders:z.boolean(),emailReminders:z.boolean()});
export type NotificationPreferences=z.infer<typeof notificationPreferences>;
export const notificationUpdate=z.object({action:z.enum(['read','read_all','clear']),id:z.string().uuid().optional()}).refine(v=>v.action!=='read'||!!v.id,{message:'Pilih notifikasi.'});
