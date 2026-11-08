import type { Metadata } from "next";
import { AppProvider } from "@/context/app-context";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FindBack | Campus Lost & Found", template: "%s | FindBack" },
  description: "A smart campus lost-and-found experience. Report, discover, and recover items with confidence.",
  icons: { icon: "/findback-logo.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AppProvider><AppShell>{children}</AppShell></AppProvider></body></html>;
}
