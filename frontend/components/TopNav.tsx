"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LoginModal } from "@/components/LoginModal";

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      {/* Clean Black Lock Emblem */}
      <div className="size-8 rounded-lg bg-black text-white p-1 flex items-center justify-center shrink-0">
        <svg viewBox="0 0 24 24" fill="none" className="size-5">
          <path
            d="M7 10V7a5 5 0 0110 0v3"
            stroke="#ffffff"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <rect
            x="4"
            y="10"
            width="16"
            height="11"
            rx="2.5"
            fill="#ffffff"
          />
          <path
            d="M8.5 15.5l2.5 2.5 4.5-4.5"
            stroke="#000000"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <span className="text-lg tracking-tight text-black font-bold flex items-center gap-1.5">
        <span>Sudibran</span>
        <span className="text-neutral-500 font-normal text-sm">Cyber</span>
      </span>
    </span>
  );
}

export function TopNav() {
  const path = usePathname();
  const router = useRouter();
  const { user, isAdmin, logout } = useAuth();
  const [connection, setConnection] = useState<"checking" | "connected" | "offline">("checking");
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginRole, setLoginRole] = useState<"admin" | "client">("admin");

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        await api.health();
        if (!cancelled) setConnection("connected");
      } catch {
        if (!cancelled) setConnection("offline");
      }
    };
    probe();
    const timer = window.setInterval(probe, 25000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const connected = connection === "connected";

  const navLinks = !user
    ? [
        { href: "/", label: "Home" },
        { href: "/#overview-architecture", label: "About us" },
        { href: "/#services", label: "Services" },
        { href: "/#risks", label: "Defense Rails" },
      ]
    : user.role === "client"
    ? [
        { href: "/", label: "Home" },
        { href: "/app", label: "Payments" },
        { href: "/automation", label: "Concierge" },
        { href: "/setup", label: "Policies" },
        { href: "/evidence", label: "Audit trail" },
      ]
    : [
        { href: "/", label: "Home" },
        { href: "/dashboard", label: "Defense Console", badge: "Admin" },
      ];

  const handleDashboardClick = (e: React.MouseEvent) => {
    if (!user) {
      e.preventDefault();
      setLoginRole("admin");
      setIsLoginModalOpen(true);
    } else if (!isAdmin) {
      e.preventDefault();
      router.push("/dashboard");
    }
  };

  const handleOpenLogin = (role: "admin" | "client" = "admin") => {
    setLoginRole(role);
    setIsLoginModalOpen(true);
  };

  return (
    <>
      <header className="sticky top-0 z-40 shrink-0 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center gap-8 px-6">
          {/* Brand Wordmark */}
          <Link href="/" aria-label="Sudibran Cyber Home" className="hover:opacity-85 transition-opacity flex items-center shrink-0">
            <Wordmark />
          </Link>

          {/* Centered Navigation Links */}
          <nav className="hidden md:flex h-full items-center gap-6 mx-auto">
            {navLinks.map((l) => {
              const activeLink = l.href === "/" ? path === "/" : path === l.href || path.startsWith(l.href + "/");
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={activeLink ? "page" : undefined}
                  className={`text-sm font-medium transition-colors ${
                    activeLink
                      ? "text-black font-semibold border-b-2 border-black py-4"
                      : "text-neutral-600 hover:text-black py-4"
                  }`}
                >
                  {l.label}
                  {l.badge && (
                    <span className="ml-1.5 rounded bg-neutral-100 text-neutral-800 border border-neutral-300 px-1.5 py-0.2 text-[10px] font-mono font-medium uppercase">
                      {l.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right Action Area */}
          <div className="ml-auto flex items-center gap-3 shrink-0">
            {/* Backend Sandbox Status Pill */}
            <span
              role="status"
              className="hidden lg:flex items-center gap-2 rounded border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-mono font-medium text-neutral-700"
            >
              <span className={`size-1.5 rounded-full ${connected ? "bg-black" : "bg-neutral-400"}`} />
              {connected ? "Sandbox Live" : "Connecting…"}
            </span>

            {/* Authenticated User or Standard Buttons */}
            {user ? (
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-full text-xs font-bold bg-black text-white">
                    {user.avatarLetter}
                  </span>
                  <span className="leading-tight hidden sm:block text-left">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-black">
                      {user.name}
                      <span className="text-[10px] bg-neutral-100 text-neutral-700 border border-neutral-200 px-1.5 py-0.2 rounded font-mono uppercase">
                        {user.role}
                      </span>
                    </span>
                    <span className="block text-[11px] text-neutral-500 truncate max-w-[130px]">{user.title}</span>
                  </span>
                </span>

                <button
                  onClick={logout}
                  title="Sign out"
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-800 transition-colors"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => handleOpenLogin("client")}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100 transition-colors hidden sm:block"
                >
                  Client Portal
                </button>

                <button
                  onClick={() => handleOpenLogin("admin")}
                  className="text-xs font-medium text-neutral-600 hover:text-black transition-colors px-2 py-1"
                >
                  Sign in
                </button>

                <Link
                  href="/dashboard"
                  onClick={handleDashboardClick}
                  className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold rounded-lg bg-black hover:bg-neutral-800 text-white transition-colors"
                >
                  <span>Contact Us</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        defaultRole={loginRole}
      />
    </>
  );
}
