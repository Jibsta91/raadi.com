'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

/**
 * The filter sidebar. On wide screens it is a plain column; on phones it opens as a
 * full-screen sheet (FINN-style) from a "Filters (n)" button, with a sticky "Show n results"
 * button. Filters are links, so the sheet stays open while the results update behind it.
 */
export function FilterPanel({
  title,
  showResults,
  active,
  closeLabel,
  clear,
  children,
}: {
  title: string;
  showResults: string;
  active: number;
  closeLabel: string;
  clear?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // The sheet covers the page: keep the page behind it from scrolling.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        data-testid="open-filters"
        className="flex h-11 items-center justify-center gap-2 rounded-full border bg-card px-5 text-sm font-semibold md:hidden"
      >
        <SlidersHorizontal aria-hidden className="size-4" />
        {title}
        {active > 0 ? (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
            {active}
          </span>
        ) : null}
      </button>
      <aside
        aria-label={title}
        className={`${open ? 'fixed inset-0 z-50 flex' : 'hidden'} flex-col bg-background md:static md:z-auto md:flex md:bg-transparent`}
      >
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3 md:border-0 md:p-0 md:pb-4">
          <h2 className="text-lg font-semibold md:text-base">{title}</h2>
          <div className="flex items-center gap-1">
            {clear}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={closeLabel}
              className="flex size-10 items-center justify-center rounded-full hover:bg-accent md:hidden"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4 md:overflow-visible md:p-0">
          {children}
        </div>
        <div className="border-t p-4 md:hidden">
          <button
            type="button"
            onClick={() => setOpen(false)}
            data-testid="show-results"
            className="h-12 w-full rounded-full bg-primary font-semibold text-primary-foreground"
          >
            {showResults}
          </button>
        </div>
      </aside>
    </>
  );
}
