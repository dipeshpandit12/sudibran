"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type UserRole = "admin" | "client";

export interface User {
  username: string;
  name: string;
  role: UserRole;
  title: string;
  organization: string;
  avatarLetter: string;
}

// Internal credential registry (NOT exposed directly in the UI)
const USER_REGISTRY: Record<UserRole, { cred: { user: string; pass: string }; profile: User }> = {
  admin: {
    cred: { user: "admin", pass: "password123" },
    profile: {
      username: "admin",
      name: "Alex Vance",
      role: "admin",
      title: "SecOps Admin",
      organization: "Sudibran Security Control",
      avatarLetter: "A",
    },
  },
  client: {
    cred: { user: "maya", pass: "password123" },
    profile: {
      username: "maya",
      name: "Maya Chen",
      role: "client",
      title: "Accounts Payable Clerk",
      organization: "Acme Corp · Finance",
      avatarLetter: "M",
    },
  },
};

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password?: string, role?: UserRole) => boolean;
  loginAsRole: (role: UserRole, password?: string) => boolean;
  loginAs: (role: UserRole) => void;
  logout: () => void;
  isAdmin: boolean;
  isClient: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: () => false,
  loginAsRole: () => false,
  loginAs: () => {},
  logout: () => {},
  isAdmin: false,
  isClient: false,
  isAuthenticated: false,
});

const STORAGE_KEY = "sudibran_active_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && (parsed.role === "admin" || parsed.role === "client")) {
          setUser(parsed);
        }
      }
      // Note: If no user is stored, user remains null (Landing page accessible without login)
    } catch {
      // Ignore storage errors
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = (usernameInput: string, passwordInput: string = "", targetRole?: UserRole): boolean => {
    const cleanUser = usernameInput.trim().toLowerCase();
    const cleanPass = passwordInput.trim();

    // Check admin
    if (
      (cleanUser === "admin" || cleanUser === "admin@sudibran.security" || (targetRole === "admin" && (cleanUser === "" || cleanUser === "admin"))) &&
      (cleanPass === "" || cleanPass === USER_REGISTRY.admin.cred.pass)
    ) {
      const adminUser = USER_REGISTRY.admin.profile;
      setUser(adminUser);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(adminUser));
      } catch {}
      return true;
    }

    // Check client (Maya)
    if (
      (cleanUser === "maya" || cleanUser === "client" || cleanUser === "maya@acme.corp" || (targetRole === "client" && (cleanUser === "" || cleanUser === "client" || cleanUser === "maya"))) &&
      (cleanPass === "" || cleanPass === USER_REGISTRY.client.cred.pass)
    ) {
      const clientUser = USER_REGISTRY.client.profile;
      setUser(clientUser);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(clientUser));
      } catch {}
      return true;
    }

    return false;
  };

  const loginAsRole = (role: UserRole, passwordInput: string = ""): boolean => {
    const reg = USER_REGISTRY[role];
    const cleanPass = passwordInput.trim();
    if (cleanPass !== "" && cleanPass !== reg.cred.pass) {
      return false;
    }
    const profile = reg.profile;
    setUser(profile);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {}
    return true;
  };

  const logout = () => {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        loginAsRole,
        loginAs: (role) => {
          loginAsRole(role);
        },
        logout,
        isAdmin: user?.role === "admin",
        isClient: user?.role === "client",
        isAuthenticated: Boolean(user),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
