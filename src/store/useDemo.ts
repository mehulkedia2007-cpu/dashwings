'use client';
import { useEffect } from 'react';
import { useStore } from 'zustand';
import { demoStore, type DemoState } from './demoStore';

export const useDemo = <T,>(selector: (s: DemoState) => T): T => useStore(demoStore, selector);

/** Loads saved demo state after mount (keeps server and first client render identical). */
export function DemoHydrator() {
  useEffect(() => {
    demoStore.persist.rehydrate();
  }, []);
  return null;
}
