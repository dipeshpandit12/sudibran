"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";
import { useAuth } from "@/lib/auth";
import { LoginModal } from "@/components/LoginModal";
import { Panel } from "@/components/ui";

interface ClientGuardProps {
  children: ReactNode;
  pageTitle?: string;
}

export function ClientGuard({ children, pageTitle = "Client Workspace" }: ClientGuardProps) {
  const { user, isClient, isAdmin, isLoading } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [modalRole, setModalRole] = useState<"admin" | "client">("client");

  if (isLoading) {
    return (
      <div className="flex-1 min-h-[70vh] flex flex-col items-center justify-center p-8 bg-white text-black">
        <div className="size-6 rounded-full border-2 border-neutral-300 border-t-black animate-spin mb-3" />
        <p className="text-xs font-mono text-neutral-500">Verifying authorization…</p>
      </div>
    );
  }

  // If user is not logged in:
  if (!user) {
    return (
      <div className="flex-1 min-h-[75vh] flex flex-col items-center justify-center text-center px-6 py-16 bg-white text-black">
        <Panel className="max-w-lg w-full p-8 border border-neutral-200 bg-white text-center shadow-none rounded-xl">
          <div className="size-12 rounded-lg bg-neutral-100 border border-neutral-200 flex items-center justify-center text-2xl mx-auto mb-4">
            💼
          </div>

          <span className="px-3 py-1 rounded border border-neutral-300 bg-neutral-100 text-xs font-mono font-medium text-neutral-800 inline-block mb-3">
            Client Authentication Required
          </span>

          <h1 className="text-2xl font-bold tracking-tight text-black">
            {pageTitle}
          </h1>

          <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
            This workspace is reserved for Accounts Payable clients to manage invoices, concierge booking, standing payment policies, and audit trails. Please authenticate to continue.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => {
                setModalRole("client");
                setIsLoginModalOpen(true);
              }}
              className="px-5 py-2.5 rounded-lg text-xs font-semibold bg-black hover:bg-neutral-800 text-white transition-colors"
            >
              Sign In as Client ↗
            </button>
            <Link
              href="/"
              className="px-4 py-2.5 rounded-lg text-xs font-medium border border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-800 transition-colors"
            >
              ← Return Home
            </Link>
          </div>
        </Panel>

        <LoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          defaultRole={modalRole}
        />
      </div>
    );
  }

  // If logged in as Admin, user cannot access client-only pages:
  if (isAdmin && !isClient) {
    return (
      <div className="flex-1 min-h-[75vh] flex flex-col items-center justify-center text-center px-6 py-16 bg-white text-black">
        <Panel className="max-w-lg w-full p-8 border border-neutral-200 bg-white text-center shadow-none rounded-xl">
          <div className="size-12 rounded-lg bg-neutral-100 border border-neutral-200 flex items-center justify-center text-2xl mx-auto mb-4">
            🛡️
          </div>

          <span className="px-3 py-1 rounded border border-neutral-300 bg-neutral-100 text-xs font-mono font-medium text-neutral-800 inline-block mb-3">
            Client Workspace Restricted
          </span>

          <h1 className="text-2xl font-bold tracking-tight text-black">
            Accounts Payable Portal
          </h1>

          <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
            You are currently signed in as <strong className="text-black">SecOps Admin</strong>. Admins have dedicated access to the <strong className="text-black">SecOps Defense Dashboard</strong>. Accounts payable payments and policies are managed exclusively by Finance Clients.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="px-5 py-2.5 rounded-lg text-xs font-semibold bg-black hover:bg-neutral-800 text-white transition-colors"
            >
              Go to Admin Dashboard ↗
            </Link>
            <button
              onClick={() => {
                setModalRole("client");
                setIsLoginModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-lg text-xs font-medium border border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-800 transition-colors"
            >
              Switch to Client Account
            </button>
          </div>
        </Panel>

        <LoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          defaultRole={modalRole}
        />
      </div>
    );
  }

  return <>{children}</>;
}
