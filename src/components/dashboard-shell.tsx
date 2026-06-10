"use client";

import {
  LayersIcon,
  LineChartIcon,
  SearchIcon,
  SettingsIcon,
  BellIcon,
  BotIcon,
  HistoryIcon,
  CommandIcon,
  UsersRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { useTheme } from "next-themes";

import { CommandMenu } from "@/components/command-menu";
import { NavigationProgress } from "@/components/navigation-progress";
import { NotificationBell } from "@/components/notification-bell";
import { QueryPendingOverlay } from "@/components/query-pending-overlay";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Overview", icon: LineChartIcon },
  { href: "/sources", label: "Sources", icon: LayersIcon },
  { href: "/jobs", label: "Jobs", icon: SearchIcon },
  { href: "/clients", label: "Client analysis", icon: UsersRoundIcon },
  { href: "/history", label: "History", icon: HistoryIcon },
  { href: "/ai", label: "AI Analysis", icon: BotIcon },
  { href: "/discord", label: "Discord", icon: BellIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { setTheme, resolvedTheme } = useTheme();
  const setOpenCmd = useUiStore((s) => s.setCommandOpen);

  const [themeHydrated, setThemeHydrated] = React.useState(false);

  React.useEffect(() => setThemeHydrated(true), []);

  return (
    <>
      <NavigationProgress />
      <QueryPendingOverlay />
      <CommandMenu />
      <div className="relative flex min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 shrink-0 border-r border-zinc-200 bg-white/95 px-3 pb-8 pt-6 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 md:flex md:flex-col">
          <Link href="/" className="flex items-center gap-2 px-2 text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            <span className="rounded-md bg-gradient-to-br from-zinc-900 to-zinc-600 px-1.5 py-0.5 text-[11px] text-white shadow-sm dark:from-white dark:to-zinc-400 dark:text-black">
              JH
            </span>
            Control
          </Link>

          <nav className="mt-10 flex flex-1 flex-col gap-px">
            {nav.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-50",
                    active
                      ? "bg-zinc-900 text-white shadow-sm dark:bg-zinc-50 dark:text-zinc-900"
                      : "text-zinc-600 dark:text-zinc-300",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <Separator />
          <p className="mt-5 px-2 text-[11px] uppercase tracking-[0.12em] text-zinc-400">
            Freelance ingestion
          </p>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col md:pl-56">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-zinc-200 bg-white/90 px-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="md:hidden"
                onClick={() => setOpenCmd(true)}
              >
                Menu
              </Button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                  Job Hunter
                </p>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  Operations console · Lancers & CrowdWorks
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <NotificationBell />
              <Button
                variant="outline"
                size="sm"
                className="hidden sm:inline-flex"
                onClick={() => setOpenCmd(true)}
              >
                <CommandIcon className="size-4" />
                <span className="ml-1 text-xs text-zinc-500">⌘K</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full text-xs"
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                aria-label="Toggle theme"
              >
                {themeHydrated ? (
                  <>Theme: {resolvedTheme === "dark" ? "dark" : "light"}</>
                ) : (
                  <>Theme</>
                )}
              </Button>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 md:px-8 lg:px-10">{children}</main>
        </div>
      </div>
    </>
  );
}
