"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, type UserRole } from "@/lib/auth";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultRole?: UserRole;
  redirectUrl?: string;
}

export function LoginModal({ isOpen, onClose, defaultRole = "admin", redirectUrl }: LoginModalProps) {
  const router = useRouter();
  const { login, loginAsRole } = useAuth();

  const [role, setRole] = useState<UserRole>(defaultRole);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleRoleChange = (newRole: UserRole) => {
    setRole(newRole);
    setError(null);
    setUsername("");
    setPassword("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    setTimeout(() => {
      const ok = login(username, password, role);
      setLoading(false);
      if (ok) {
        onClose();
        if (redirectUrl) {
          router.push(redirectUrl);
        } else if (role === "admin") {
          router.push("/dashboard");
        } else {
          router.push("/app");
        }
      } else {
        setError("Invalid username or password. Please verify your credentials.");
      }
    }, 200);
  };

  const handleQuickAccess = (selectedRole: UserRole) => {
    setLoading(true);
    setTimeout(() => {
      const ok = loginAsRole(selectedRole);
      setLoading(false);
      if (ok) {
        onClose();
        if (redirectUrl) {
          router.push(redirectUrl);
        } else if (selectedRole === "admin") {
          router.push("/dashboard");
        } else {
          router.push("/app");
        }
      }
    }, 150);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-in fade-in duration-150">
      {/* Click outside to dismiss */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Modal Card */}
      <div className="relative w-full max-w-md rounded-xl bg-white border border-neutral-300 p-6 text-black z-10">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-200">
          <h3 className="text-base font-bold text-black">Authenticate Access</h3>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-black p-1 rounded hover:bg-neutral-100 transition-colors"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* 2-Option Portal Selector Tabs */}
        <div className="mt-4">
          <p className="text-xs font-mono uppercase tracking-wider text-neutral-500 mb-2">
            Select Portal:
          </p>
          <div className="grid grid-cols-2 gap-1 p-1 bg-neutral-100 rounded-lg border border-neutral-200">
            <button
              type="button"
              onClick={() => handleRoleChange("admin")}
              className={`py-2 px-3 text-xs font-medium rounded transition-colors ${
                role === "admin"
                  ? "bg-white text-black font-semibold border border-neutral-300"
                  : "text-neutral-600 hover:text-black"
              }`}
            >
              Admin Console
            </button>
            <button
              type="button"
              onClick={() => handleRoleChange("client")}
              className={`py-2 px-3 text-xs font-medium rounded transition-colors ${
                role === "client"
                  ? "bg-white text-black font-semibold border border-neutral-300"
                  : "text-neutral-600 hover:text-black"
              }`}
            >
              Client Portal
            </button>
          </div>
        </div>

        {/* Role Description Note */}
        <div className="mt-3 p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-xs text-neutral-700">
          {role === "admin" ? (
            <p className="leading-relaxed">
              <strong className="text-black">SecOps Admin:</strong> Access live defense traces, threat sandboxes, and circuit breaker switches.
            </p>
          ) : (
            <p className="leading-relaxed">
              <strong className="text-black">Finance Client:</strong> Access invoice queue, concierge booking, policy thresholds, and audit trails.
            </p>
          )}
        </div>

        {/* Quick Authenticate CTA Button */}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => handleQuickAccess(role)}
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg font-medium text-sm text-white bg-black hover:bg-neutral-800 transition-colors"
          >
            Authenticate as {role === "admin" ? "SecOps Admin" : "Client User"} ↗
          </button>
        </div>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-neutral-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-2.5 text-neutral-500 font-mono text-[11px] uppercase tracking-wider">
              Or Enter Credentials
            </span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-neutral-600 mb-1">
              {role === "admin" ? "Admin Username" : "Client Username"}
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={role === "admin" ? "admin" : "maya"}
              className="w-full px-3 py-2 rounded-lg bg-white border border-neutral-300 text-sm text-black placeholder:text-neutral-400 focus:outline-none focus:border-black font-mono transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-neutral-600 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3 py-2 rounded-lg bg-white border border-neutral-300 text-sm text-black placeholder:text-neutral-400 focus:outline-none focus:border-black font-mono transition-colors"
            />
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-neutral-100 border border-neutral-300 text-xs text-black font-mono">
              {error}
            </div>
          )}

          <div className="pt-1">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg font-medium text-sm border border-neutral-300 bg-white hover:bg-neutral-100 text-black transition-colors disabled:opacity-50"
            >
              {loading ? "Verifying clearance…" : `Sign in to ${role === "admin" ? "Admin Console" : "Client Portal"} ↗`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
