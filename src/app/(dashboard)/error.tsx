"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-24 text-center">
      <p className="text-sm font-semibold text-red-500">Something fractured</p>
      <p className="text-sm text-zinc-500">{error.message}</p>
      <Button onClick={() => reset()} variant="outline">
        Try reloading this surface
      </Button>
    </div>
  );
}
