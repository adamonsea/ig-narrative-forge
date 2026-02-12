import { useState, useEffect } from 'react';

const STORAGE_KEY = 'eezee_reduce_animations';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (localStorage.getItem(STORAGE_KEY) === 'true') return true;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => {
      if (localStorage.getItem(STORAGE_KEY) === 'true') return;
      setReduced(mq.matches);
    };
    mq.addEventListener('change', handler);

    // Listen for localStorage changes from the toggle
    const storageHandler = () => {
      const pref = localStorage.getItem(STORAGE_KEY);
      setReduced(pref === 'true' || mq.matches);
    };
    window.addEventListener('storage', storageHandler);
    window.addEventListener('eezee_reduce_animations_changed', storageHandler);

    return () => {
      mq.removeEventListener('change', handler);
      window.removeEventListener('storage', storageHandler);
      window.removeEventListener('eezee_reduce_animations_changed', storageHandler);
    };
  }, []);

  return reduced;
}

/** Toggle the reduce-animations preference and notify listeners */
export function setReduceAnimations(value: boolean) {
  localStorage.setItem(STORAGE_KEY, String(value));
  window.dispatchEvent(new Event('eezee_reduce_animations_changed'));
}
