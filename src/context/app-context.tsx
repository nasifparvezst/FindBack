"use client";

import type { ReactNode } from "react";
import { DEMO_MODE } from "@/context/app-store";
import { DemoProvider } from "@/context/demo-provider";
import { CloudProvider } from "@/context/cloud-provider";

export { DEMO_MODE, useApp } from "@/context/app-store";

export function AppProvider({ children }: { children: ReactNode }) {
  if (DEMO_MODE) return <DemoProvider>{children}</DemoProvider>;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return (
      <main className="page-section container">
        <div className="panel guide-card" role="alert">
          <h1>Cloud setup required</h1>
          <p>Cloud mode is enabled, but the Supabase connection settings are missing.</p>
          <p>Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to your local <code>.env.local</code> file or hosting environment. Restart the development server, or rebuild the production app, after changing them.</p>
          <p>For a local demo without a cloud account, set <code>NEXT_PUBLIC_DEMO_MODE=true</code>. See <code>docs/STEP2_SETUP.md</code> for the cloud setup steps.</p>
        </div>
      </main>
    );
  }
  return <CloudProvider>{children}</CloudProvider>;
}
