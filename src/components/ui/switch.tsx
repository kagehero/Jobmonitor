"use client";

import * as SwitchPrimitives from "@radix-ui/react-switch";
import * as React from "react";

import { cn } from "@/lib/utils";

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-[22px] w-[42px] shrink-0 cursor-pointer items-center rounded-full border border-transparent shadow-inner transition-colors",
      "outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/80 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950",
      "disabled:cursor-not-allowed disabled:opacity-45",
      /* OFF — dim track, reads clearly “inactive” in light + dark */
      "data-[state=unchecked]:bg-zinc-300 data-[state=unchecked]:shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]",
      "dark:data-[state=unchecked]:bg-zinc-700 dark:data-[state=unchecked]:shadow-[inset_0_1px_3px_rgba(0,0,0,0.35)]",
      /* ON — high-contrast green, unmistakable from OFF */
      "data-[state=checked]:border-emerald-700/40 data-[state=checked]:bg-emerald-600 data-[state=checked]:shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)]",
      "dark:data-[state=checked]:border-emerald-400/30 dark:data-[state=checked]:bg-emerald-500",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block size-[18px] rounded-full bg-white shadow-md ring-1 ring-black/10 transition-transform will-change-transform",
        "data-[state=unchecked]:translate-x-[3px]",
        "data-[state=checked]:translate-x-[21px]",
        /* Thumb ring contrasts on green vs gray track */
        "data-[state=checked]:ring-white/40 dark:data-[state=checked]:ring-white/20",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;
