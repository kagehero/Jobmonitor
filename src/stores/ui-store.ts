"use client";

import { create } from "zustand";

type UiState = {
  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  commandOpen: false,
  setCommandOpen: (v) => set({ commandOpen: v }),
}));
