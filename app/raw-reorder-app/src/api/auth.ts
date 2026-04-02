import { apiPost, setAuthToken } from './client';

export type LoginResponse = {
  token: string;
  user?: {
    id: number | string;
    email?: string;
    role?: string;
  };
};

export async function login(email: string, password: string) {
  const data = await apiPost<LoginResponse>('authReg/login', {
    email,
    password,
  });

  if (!data?.token) {
    throw new Error('Ingen token kom tillbaka från login.');
  }

  setAuthToken(data.token);
  return data;
}