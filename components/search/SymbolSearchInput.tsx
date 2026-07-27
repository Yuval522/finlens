"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import type { SearchResultItem } from "@/lib/finance/types";
import { SymbolSearchResultRow } from "./SymbolSearchResultRow";

const DEBOUNCE_MS = 250;

export function SymbolSearchInput() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Search is temporarily unavailable");
          setResults([]);
        } else {
          setError(null);
          setResults(data.results ?? []);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError("Search is temporarily unavailable");
          setResults([]);
        }
      } finally {
        setLoading(false);
        setActiveIndex(-1);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function selectResult(result: SearchResultItem) {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(`/analysis/${encodeURIComponent(result.symbol)}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = results[activeIndex] ?? results[0];
      if (chosen) selectResult(chosen);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showDropdown = open && query.trim().length > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search stocks, symbol, companies..."
        className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls="symbol-search-listbox"
        aria-autocomplete="list"
        // Bug fix: the browser's own autofill/field-history suggestion box
        // (a separate floating element the page can't style or control,
        // rendered above everything including our dropdown) was appearing
        // and visually colliding with our custom listbox below — reported
        // as a stray "amen X"-style entry overlapping the typed query, and
        // very likely also the cause of the "clicks sometimes do nothing"
        // reports, since a click aimed at our listbox can instead land on
        // that native overlay sitting on top of it. autoComplete="off" is
        // the standard, broadly-respected way to opt a plain text input
        // like this out of that browser feature; the extra data-* flags
        // below cover 1Password/LastPass, which have their own separate
        // suggestion-icon overlay and ignore autoComplete.
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore="true"
      />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}

      {showDropdown && (
        <div
          id="symbol-search-listbox"
          role="listbox"
          className="search-dropdown-panel absolute left-0 right-0 top-11 z-50 max-h-96 divide-y divide-border/60 overflow-y-auto rounded-md border border-border shadow-xl"
        >
          {error && (
            <p className="px-3 py-3 text-sm text-destructive">{error}</p>
          )}
          {!error && !loading && results.length === 0 && (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              No matches for &ldquo;{query.trim()}&rdquo;
            </p>
          )}
          {!error &&
            results.map((result, i) => (
              <SymbolSearchResultRow
                key={result.symbol}
                result={result}
                active={i === activeIndex}
                onSelect={selectResult}
              />
            ))}
        </div>
      )}
    </div>
  );
}
