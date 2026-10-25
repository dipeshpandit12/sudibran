import type { ReactNode } from "react";

import { DashSidebar } from "@/components/DashSidebar";

/** Every operational page hangs off the same left panel. */
export default function DashLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-6 px-6 py-6 lg:flex-row lg:gap-8">
      <aside className="shrink-0 lg:w-[232px]">
        <DashSidebar />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
