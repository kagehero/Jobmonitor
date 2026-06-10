"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export function Table(props: React.TableHTMLAttributes<HTMLTableElement>) {
  const { className, ...rest } = props;
  return (
    <div className="relative w-full overflow-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...rest} />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("[&_tr]:border-b", className)} {...props} />;
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      {...props}
      className={cn(
        "border-b border-zinc-200 transition-colors hover:bg-zinc-50/70 data-[state=selected]:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-950/60",
        className,
      )}
    />
  );
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...props}
      className={cn(
        "h-11 px-3 text-left align-middle text-xs font-medium text-zinc-500 dark:text-zinc-400",
        className,
      )}
    />
  );
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("align-middle px-3 py-3", className)} {...props} />;
}
