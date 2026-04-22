// auth/AuthContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { storage } from '../storage';

// ✅ RÄTT import – peka på din axios-instans i /api/index.ts
import { api, setAuthToken, onUnauthorized } from '../index';

export type User = {
    id: number;
    username: string;
    email: string;
    role: string;
    perms: string[];
};

type AuthCtx = {
    user: User | null;
    token: string | null;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    can: (perm: string) => boolean;
};

const Ctx = createContext<AuthCtx>(null as any);

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setTokenState] = useState<string | null>(null);

    const can = (perm: string) => {
        const p = user?.perms || [];
        if (p.includes('*')) return true;
        if (p.includes(perm)) return true;
        const [ns] = perm.split(':');
        return p.includes(`${ns}:*`);
    };

    const persist = async (t: string | null, u?: User | null) => {
        setTokenState(t);
        setAuthToken(t);
        if (t) await storage.setItem(TOKEN_KEY, t);
        else await storage.deleteItem(TOKEN_KEY);

        if (u !== undefined) {
            if (u) await storage.setItem(USER_KEY, JSON.stringify(u));
            else await storage.deleteItem(USER_KEY);
        }
    };

    // ✅ Lyft mot din fungerande serverrutt: /api/authReg/login
    const login = async (email: string, password: string) => {
        const { data } = await api.post('authReg/login', { email, password });
        setUser(data.user);
        await persist(data.token, data.user);
    };

    const logout = async () => {
        setUser(null);
        await persist(null, null);
    };

    useEffect(() => {
        (async () => {
            try {
                const t = await storage.getItem(TOKEN_KEY);
                const u = await storage.getItem(USER_KEY);
                if (t) setAuthToken(t);
                if (u) {
                    setUser(JSON.parse(u) as User);
                    setTokenState(t);
                }
            } catch {/* ignore */ }
        })();
    }, []);

    useEffect(() => {
        onUnauthorized(() => { logout(); });
    }, []);

    const value = useMemo(() => ({ user, token, login, logout, can }), [user, token]);
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useAuth = () => useContext(Ctx);
