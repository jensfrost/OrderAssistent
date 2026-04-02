// app/HundapoteketApp/api/authReg.ts
import { api } from './index';

type ReqCfg = { signal?: AbortSignal };

/** POST /api/authReg/forgot */
export const forgotPassword = (email: string, cfg?: ReqCfg) =>
  api.post<void>('/authReg/forgot', { email }, { signal: cfg?.signal });

/** POST /api/authReg/reset */
export const resetPasswordWithToken = (token: string, password: string, cfg?: ReqCfg) =>
  api.post<void>('/authReg/reset', { token, password }, { signal: cfg?.signal });

/** POST /api/authReg/change-password */
export const changePassword = (currentPassword: string, newPassword: string, cfg?: ReqCfg) =>
  api.post<void>('/authReg/change-password', { currentPassword, newPassword }, { signal: cfg?.signal });
