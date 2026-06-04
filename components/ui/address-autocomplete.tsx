"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AddressResult {
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
    road?: string;
    house_number?: string;
    state?: string;
  };
}

export interface ParsedAddress {
  address: string;
  city: string;
  postalCode: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
}

interface AddressAutocompleteProps {
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onSelect: (result: ParsedAddress) => void;
  onClear?: () => void;
}

function parseNominatimResult(result: AddressResult): ParsedAddress {
  const addr = result.address || {};
  const city = addr.city || addr.town || addr.village || addr.municipality || "";
  const postalCode = addr.postcode || "";
  const country = addr.country || "";
  const countryCode = (addr.country_code || "").toUpperCase();

  // Build a clean address string
  const parts: string[] = [];
  if (addr.road) {
    parts.push(addr.house_number ? `${addr.road} ${addr.house_number}` : addr.road);
  }
  if (city) parts.push(city);
  if (postalCode) parts.push(postalCode);
  if (country) parts.push(country);

  return {
    address: parts.length > 0 ? parts.join(", ") : result.display_name,
    city,
    postalCode,
    country,
    countryCode,
    lat: parseFloat(result.lat) || 0,
    lng: parseFloat(result.lon) || 0,
  };
}

export function AddressAutocomplete({
  value = "",
  placeholder = "Search address...",
  disabled = false,
  className,
  onSelect,
  onClear,
}: AddressAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<AddressResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync external value changes
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/tms/geocode?action=search&q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data: AddressResult[] = await res.json();
        setResults(Array.isArray(data) ? data : []);
        setHighlightIndex(-1);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  const handleSelect = (result: AddressResult) => {
    const parsed = parseNominatimResult(result);
    setQuery(parsed.address);
    setOpen(false);
    setResults([]);
    onSelect(parsed);
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
    onClear?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i < results.length - 1 ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i > 0 ? i - 1 : results.length - 1));
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      handleSelect(results[highlightIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={handleInputChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-9 pr-8"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {!loading && query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-64 overflow-auto">
          {results.map((result, idx) => (
            <button
              key={result.display_name + idx}
              type="button"
              onClick={() => handleSelect(result)}
              className={cn(
                "w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors",
                highlightIndex === idx && "bg-accent"
              )}
            >
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <span className="line-clamp-2">{result.display_name}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && query.length >= 2 && !loading && results.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg p-3 text-sm text-muted-foreground">
          No results found
        </div>
      )}
    </div>
  );
}
