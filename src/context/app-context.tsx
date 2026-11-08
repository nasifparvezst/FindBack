"use client";

import type { ReactNode } from "react";
import { DEMO_MODE } from "@/context/app-store";
import { DemoProvider } from "@/context/demo-provider";
import { CloudProvider } from "@/context/cloud-provider";

export { DEMO_MODE, useApp } from "@/context/app-store";

export function AppProvider({ children }: { children: ReactNode }) {
  return DEMO_MODE ? <DemoProvider>{children}</DemoProvider> : <CloudProvider>{children}</CloudProvider>;
}
