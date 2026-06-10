"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import {
  LayersIcon,
  LineChartIcon,
  SearchIcon,
  SettingsIcon,
  BellIcon,
  BotIcon,
  HistoryIcon,
  UsersRoundIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useUiStore } from "@/stores/ui-store";

import { cn } from "@/lib/utils";

const links = [
  { label: "Dashboard", href: "/", icon: LineChartIcon },
  { label: "Sources", href: "/sources", icon: LayersIcon },
  { label: "Jobs", href: "/jobs", icon: SearchIcon },
  { label: "Client analysis", href: "/clients", icon: UsersRoundIcon },
  { label: "History", href: "/history", icon: HistoryIcon },
  { label: "AI Analysis", href: "/ai", icon: BotIcon },
  { label: "Discord", href: "/discord", icon: BellIcon },
  { label: "Settings", href: "/settings", icon: SettingsIcon },
];

export function CommandMenu() {
  const open = useUiStore((s) => s.commandOpen);
  const setOpen = useUiStore((s) => s.setCommandOpen);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [open, setOpen]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-[1px]" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[35%] z-[101] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-zinc-200 bg-white p-0 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
          <CommandPrimitive label="Navigate" shouldFilter loop className="flex max-h-80 flex-col">
            <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <SearchIcon className="size-4 shrink-0 text-zinc-500" />
              <CommandPrimitive.Input
                placeholder="Search pages…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
              />
              <kbd className="hidden rounded border bg-zinc-100 px-1.5 py-px text-[10px] font-mono sm:inline-block dark:bg-zinc-900">
                esc
              </kbd>
            </div>
            <CommandPrimitive.List className="scroll-py-1 overflow-y-auto p-2">
              <CommandPrimitive.Empty className="px-4 py-6 text-center text-sm text-zinc-500">
                No routes found.
              </CommandPrimitive.Empty>
              <CommandPrimitive.Group heading="Navigate" className="text-xs font-medium text-zinc-400">
                {links.map((l) => {
                  const Icon = l.icon;
                  return (
                    <CommandPrimitive.Item
                      key={l.href}
                      value={l.label + l.href}
                      onSelect={() => {
                        setOpen(false);
                        router.push(l.href);
                      }}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-900",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span>{l.label}</span>
                    </CommandPrimitive.Item>
                  );
                })}
              </CommandPrimitive.Group>
            </CommandPrimitive.List>
          </CommandPrimitive>
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
