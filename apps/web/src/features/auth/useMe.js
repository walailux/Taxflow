import { useQuery } from '@tanstack/react-query';
import { authApi } from './authApi.js';

export const ME_KEY = ['auth', 'me'];

/** ผู้ใช้ที่เข้าสู่ระบบอยู่ data = { user, profile } หรือ null */
export function useMe() {
  return useQuery({ queryKey: ME_KEY, queryFn: authApi.me, staleTime: 30_000, retry: false });
}
