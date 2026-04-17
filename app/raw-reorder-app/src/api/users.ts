// app/api/users.ts
import { api } from './index';

export type UserDTO = {
  ANANVN: number;      // id (PK) – gör den obligatorisk när backend returnerar den
  ANMAIL: string;
  ANROLE: string;
  ANRGDT?: string;
  ANLMDT?: string;
};

export type CreateUserInput = {
  ANMAIL: string;
  ANROLE: string;
  password: string;    // klient skickar klartext -> backend/DB ansvarar för hash!
};

export type RoleDTO = { ROLECODE: string; ROLENAME?: string };

// OBS: backend-routen är /api/anvReg
const BASE = 'anvReg';

export const fetchUsers = () => api.get<UserDTO[]>(BASE);

// Har du en roll-endpoint kvar kan du behålla den, annars mocka i UI om 404:
export const fetchRoles = () => api.get<RoleDTO[]>('admin/roles');

export const createUser = (p: CreateUserInput) =>
  api.post(BASE, {
    ANMAIL: p.ANMAIL,
    ANROLE: p.ANROLE,     // inkludera roll vid skapande
    ANPASS: p.password,   // backend tar emot ANPASS i din route
  });

export const updateUserById = (id: number, p: { ANMAIL: string; ANROLE: string }) =>
  api.put(`${BASE}/${id}`, {
    ANMAIL: p.ANMAIL,
    ANROLE: p.ANROLE,
  });

export const deleteUserById = (id: number) =>
  api.delete(`${BASE}/${id}`);

// Om du i framtiden lägger till reset-lösen i backend kan du aktivera detta igen
export const resetPassword = (idOrEmail: string, newPassword: string) =>
  api.post(`${BASE}/${encodeURIComponent(idOrEmail)}/reset-password`, {
    password: newPassword,
  });
