"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth, type UserRole } from "@/lib/auth";
import { Wordmark } from "@/components/TopNav";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "";

  const { login, loginAsRole, user, logout } = useAuth();
  const [selectedRole, setSelectedRole] = useState<UserRole>("admin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setError(null);
    setUsername("");
    setPassword("");
  };

  const handleManualLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    setTimeout(() => {
      const ok = login(username, password, selectedRole);
      setIsSubmitting(false);
      if (ok) {
        if (redirectUrl) {
          router.push(redirectUrl);
        } else if (selectedRole === "admin") {
          router.push("/dashboard");
        } else {
          router.push("/app");
        }
      } else {
        setError("Invalid username or password. Please verify your credentials and try again.");
      }
    }, 200);
  };

  const handleQuickLogin = (role: UserRole) => {
    setIsSubmitting(true);
    setTimeout(() => {
      const ok = loginAsRole(role);
      setIsSubmitting(false);
      if (ok) {
        if (redirectUrl) {
          router.push(redirectUrl);
        } else if (role === "admin") {
          router.push("/dashboard");
        } else {
          router.push("/app");
        }
      }
    }, 150);
  };

  return (
    <div className="relative min-h-[calc(100vh-140px)] flex flex-col justify-center items-center px-4 py-12 bg-white text-black">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <Link href="/" className="inline-block mb-3 hover:opacity-85 transition-opacity">
            <Wordmark />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-black">Authenticate Access</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Select your portal to access Sudibran security gates.
          </p>
        </div>

        {/* Current session banner if already logged in */}
        {user && (
          <div className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4 flex items-center justify-between text-sm">
            <div>
              <p className="font-semibold text-black">Signed in as {user.name}</p>
              <p className="text-xs text-neutral-500 font-mono">{user.title} ({user.role.toUpperCase()})</p>
            </div>
            <div className="flex gap-2">
              <Link
                href={user.role === "admin" ? "/dashboard" : "/app"}
                className="px-3 py-1 text-xs font-semibold bg-black text-white rounded-lg hover:bg-neutral-800 transition-colors"
              >
                Go to {user.role === "admin" ? "Dashboard" : "Payments"} ↗
              </Link>
              <button
                onClick={logout}
                className="px-3 py-1 text-xs font-medium border border-neutral-300 rounded-lg text-neutral-800 hover:bg-neutral-100"
              >
                Sign out
              </button>
            </div>
          </div>
        )}

        {/* Card */}
        <div className="rounded-xl border border-neutral-300 bg-white p-6 sm:p-7">
          {/* Role selector tabs: Admin vs Client */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-neutral-100 rounded-lg mb-5 border border-neutral-200">
            <button
              type="button"
              onClick={() => handleRoleSelect("admin")}
              className={`py-2 text-xs font-medium rounded transition-colors ${
                selectedRole === "admin"
                  ? "bg-white text-black font-semibold border border-neutral-300"
                  : "text-neutral-600 hover:text-black"
              }`}
            >
              Admin Console
            </button>
            <button
              type="button"
              onClick={() => handleRoleSelect("client")}
              className={`py-2 text-xs font-medium rounded transition-colors ${
                selectedRole === "client"
                  ? "bg-white text-black font-semibold border border-neutral-300"
                  : "text-neutral-600 hover:text-black"
              }`}
            >
              Client Portal
            </button>
          </div>

          {/* Quick Access CTA Button */}
          <div className="mb-5">
            <button
              type="button"
              onClick={() => handleQuickLogin(selectedRole)}
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 text-xs font-semibold uppercase tracking-wider rounded-lg bg-black text-white hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
            >
              <span>Quick Access as {selectedRole === "admin" ? "SecOps Admin" : "Client User"} ↗</span>
            </button>
          </div>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2.5 text-neutral-500 font-mono text-[11px] uppercase tracking-wider">
                Or Sign In with Credentials
              </span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleManualLogin} className="space-y-3.5">
            <div>
              <label htmlFor="username" className="block text-xs font-mono uppercase tracking-wider text-neutral-600 mb-1">
                {selectedRole === "admin" ? "Admin Username" : "Client Username"}
              </label>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={selectedRole === "admin" ? "admin" : "maya"}
                className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm text-black placeholder:text-neutral-400 focus:border-black focus:outline-none transition-colors font-mono"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-mono uppercase tracking-wider text-neutral-600 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm text-black placeholder:text-neutral-400 focus:border-black focus:outline-none transition-colors font-mono"
              />
            </div>

            {error && (
              <p className="text-xs font-mono text-black bg-neutral-100 p-2.5 rounded-lg border border-neutral-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-2.5 px-4 rounded-lg text-xs font-semibold uppercase tracking-wider border border-neutral-300 bg-white hover:bg-neutral-100 text-black transition-colors disabled:opacity-60"
            >
              {isSubmitting ? "Verifying clearance…" : `Sign in to ${selectedRole === "admin" ? "Admin Console" : "Client Portal"} ↗`}
            </button>
          </form>
        </div>

        {/* Back Link */}
        <div className="text-center mt-5">
          <Link href="/" className="text-xs font-mono text-neutral-600 hover:text-black transition-colors">
            ← Return to Overview
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-sm text-neutral-500 bg-white min-h-screen">Loading login portal…</div>}>
      <LoginContent />
    </Suspense>
  );
}
