'use client';
import { useState, useEffect } from 'react';

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  type: 'ticket' | 'booking' | 'reminder' | 'announcement';
  date: string;
  read: boolean;
  link?: string;
};

const STORAGE_KEY = 'summapass_notifications';

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    title: 'E-Ticket Berhasil Diterbitkan',
    message: 'E-ticket untuk acara di Summarecon Mall Bandung siap digunakan. Anda dapat mengunduh PDF atau menunjukkan QR langsung.',
    type: 'ticket',
    date: '2026-11-04T10:00:00+07:00',
    read: false,
    link: '/my-tickets'
  },
  {
    id: 'notif-2',
    title: 'Pengingat Acara H-1: Senja di Summa',
    message: 'Gate registrasi dibuka pukul 15.00 WIB di Sawarga Courtyard. Siapkan QR e-ticket Anda untuk mempercepat pemeriksaan.',
    type: 'reminder',
    date: '2026-11-03T18:30:00+07:00',
    read: false,
    link: '/events/senja-di-summa'
  },
  {
    id: 'notif-3',
    title: 'Pembaruan Fasilitas Venue',
    message: 'Tersedia shuttle bus gratis dari Stasiun Kereta Cepat Tegalluar menuju Lobi Timur Summarecon Mall Bandung.',
    type: 'announcement',
    date: '2026-11-02T14:15:00+07:00',
    read: true,
    link: '/events'
  }
];

export function getStoredNotifications(): NotificationItem[] {
  if (typeof window === 'undefined') return INITIAL_NOTIFICATIONS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_NOTIFICATIONS));
      return INITIAL_NOTIFICATIONS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_NOTIFICATIONS;
  }
}

export function saveNotifications(items: NotificationItem[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('summapass_notifications_changed', { detail: items }));
  } catch {
    // Ignore storage quota
  }
}

export function markAsRead(id: string) {
  const current = getStoredNotifications();
  const next = current.map(item => item.id === id ? { ...item, read: true } : item);
  saveNotifications(next);
}

export function markAllAsRead() {
  const current = getStoredNotifications();
  const next = current.map(item => ({ ...item, read: true }));
  saveNotifications(next);
}

export function clearNotifications() {
  saveNotifications([]);
}

export function useNotifications() {
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    setItems(getStoredNotifications());
    const onChange = (e: Event) => {
      if (e instanceof CustomEvent) {
        setItems(e.detail);
      } else {
        setItems(getStoredNotifications());
      }
    };
    window.addEventListener('summapass_notifications_changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('summapass_notifications_changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const unreadCount = items.filter(i => !i.read).length;

  return {
    items,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotifications
  };
}

