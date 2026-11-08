import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_WHATSAPP_COUNTRY,
  formatWhatsAppNumber,
  getCountries,
  getCountryCallingCode,
  isValidWhatsAppE164,
  normalizeWhatsAppNumber,
  type CountryCode,
} from '@lolas/shared';

const PRIORITY_COUNTRIES: CountryCode[] = [
  'PH', 'AU', 'US', 'GB', 'DE', 'FR', 'NL', 'ES', 'IT', 'CA', 'NZ', 'IE', 'CH', 'SE', 'IL',
  'KR', 'JP', 'CN', 'SG', 'MY',
];

const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;

export function countryName(code: CountryCode): string {
  return regionNames?.of(code) ?? code;
}

function flagEmoji(code: CountryCode): string {
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

interface CountryOption {
  code: CountryCode;
  name: string;
  dial: string;
}

let cachedOptions: CountryOption[] | null = null;
function countryOptions(): CountryOption[] {
  if (cachedOptions) return cachedOptions;
  const all = getCountries().map((code) => ({
    code,
    name: countryName(code),
    dial: getCountryCallingCode(code),
  }));
  const priority = PRIORITY_COUNTRIES
    .map((code) => all.find((o) => o.code === code))
    .filter((o): o is CountryOption => Boolean(o));
  const rest = all
    .filter((o) => !PRIORITY_COUNTRIES.includes(o.code))
    .sort((a, b) => a.name.localeCompare(b.name));
  cachedOptions = [...priority, ...rest];
  return cachedOptions;
}

const COUNTRY_ALIASES: Partial<Record<CountryCode, string[]>> = {
  GB: ['uk', 'united kingdom', 'england', 'scotland', 'wales', 'britain'],
  US: ['usa', 'america', 'united states'],
  AE: ['uae', 'dubai', 'emirates'],
  KR: ['korea'],
  NL: ['holland'],
  CZ: ['czech republic'],
  RU: ['russia'],
};

function normalizeSearch(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function searchCountries(query: string): CountryOption[] {
  const options = countryOptions();
  const q = normalizeSearch(query);
  if (!q) return options;
  const digits = q.replace(/^(\+|00)/, '').replace(/\s/g, '');
  if (/^\d+$/.test(digits)) {
    return options
      .filter((o) => o.dial.startsWith(digits))
      .sort((a, b) => Number(b.dial === digits) - Number(a.dial === digits));
  }
  const ranked: { o: CountryOption; rank: number }[] = [];
  for (const o of options) {
    const name = normalizeSearch(o.name);
    const aliases = COUNTRY_ALIASES[o.code] ?? [];
    let rank = -1;
    if (o.code.toLowerCase() === q || aliases.includes(q)) rank = 0;
    else if (name.startsWith(q) || aliases.some((a) => a.startsWith(q))) rank = 1;
    else if (name.split(/[\s-]+/).some((w) => w.startsWith(q))) rank = 2;
    else if (name.includes(q)) rank = 3;
    if (rank >= 0) ranked.push({ o, rank });
  }
  return ranked.sort((a, b) => a.rank - b.rank).map((r) => r.o);
}

function CountryPicker({
  country,
  disabled,
  onSelect,
}: {
  country: CountryCode;
  disabled?: boolean;
  onSelect: (code: CountryCode) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const results = useMemo(() => searchCountries(query), [query]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function openPicker() {
    if (disabled) return;
    setQuery('');
    setActive(Math.max(0, countryOptions().findIndex((o) => o.code === country)));
    setOpen(true);
  }

  function choose(code: CountryCode) {
    setOpen(false);
    onSelect(code);
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = results[active];
      if (pick) choose(pick.code);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative order-1 shrink-0">
      <button
        type="button"
        aria-label={`Country code: ${countryName(country)} +${getCountryCallingCode(country)}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPicker())}
        className="flex items-center gap-1 text-[13px] font-medium text-charcoal-brand disabled:cursor-not-allowed"
      >
        <span aria-hidden className="text-base leading-none">{flagEmoji(country)}</span>
        <span>+{getCountryCallingCode(country)}</span>
        <span aria-hidden className="text-[10px] opacity-50">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-[250] mt-3 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-charcoal-brand/15 bg-white text-charcoal-brand shadow-lg">
          <div className="border-b border-charcoal-brand/10 p-2">
            <input
              autoFocus
              type="search"
              role="combobox"
              aria-controls={listId}
              aria-expanded
              aria-activedescendant={results[active] ? `${listId}-${results[active].code}` : undefined}
              aria-label="Search country or code"
              placeholder="Search country or code, e.g. UK or +44"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onSearchKeyDown}
              className="w-full rounded-lg border border-charcoal-brand/20 px-3 py-2 text-base outline-none focus:border-teal-brand sm:text-sm"
            />
          </div>
          <ul ref={listRef} id={listId} role="listbox" className="max-h-64 overflow-y-auto py-1 text-sm">
            {results.length === 0 && <li className="px-3 py-2 text-charcoal-brand/50">No matching country</li>}
            {results.map((o, i) => (
              <li
                key={o.code}
                id={`${listId}-${o.code}`}
                data-index={i}
                role="option"
                aria-selected={o.code === country}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(o.code)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 ${i === active ? 'bg-teal-brand/10' : ''} ${
                  o.code === country ? 'font-semibold' : ''
                }`}
              >
                <span aria-hidden className="text-base leading-none">{flagEmoji(o.code)}</span>
                <span className="min-w-0 flex-1 truncate">{o.name}</span>
                <span className="shrink-0 text-charcoal-brand/60">+{o.dial}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function splitValue(value: string, fallbackCountry: CountryCode): { country: CountryCode; text: string } {
  if (value && isValidWhatsAppE164(value)) {
    const parsed = normalizeWhatsAppNumber(value);
    if (parsed.ok && parsed.country) {
      const dial = getCountryCallingCode(parsed.country);
      const national = formatWhatsAppNumber(value).replace(`+${dial}`, '').trim();
      return { country: parsed.country, text: national };
    }
  }
  return { country: fallbackCountry, text: value };
}

/** Submit-time check shared by every form that collects a WhatsApp number. */
export function whatsAppNumberError(value: string | null | undefined, required: boolean): string | null {
  if (!value?.trim()) return required ? 'WhatsApp number is required' : null;
  return isValidWhatsAppE164(value)
    ? null
    : 'Enter a valid WhatsApp number — pick the country, then the mobile number';
}

export interface WhatsAppNumberChangeMeta {
  valid: boolean;
  country: CountryCode;
}

interface Props {
  /** E.164 when valid; otherwise whatever was typed (or a legacy stored value). */
  value: string;
  onChange: (value: string, meta: WhatsAppNumberChangeMeta) => void;
  /** Classes for the outer field box — pass the form's usual input classes. */
  className?: string;
  defaultCountry?: CountryCode;
  required?: boolean;
  /** External error (e.g. from submit validation). */
  error?: string;
  /** Show the "We'll message you on WhatsApp at …" confirmation line. */
  showPreview?: boolean;
  helperText?: string;
  id?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

/**
 * WhatsApp number field with a country-code picker. The `+` and calling code
 * are always added for the user, and the emitted value is E.164 once valid.
 */
export function WhatsAppNumberInput({
  value,
  onChange,
  className = '',
  defaultCountry = DEFAULT_WHATSAPP_COUNTRY,
  required,
  error,
  showPreview = true,
  helperText,
  id,
  autoFocus,
  disabled,
}: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const initial = useMemo(() => splitValue(value, defaultCountry), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [country, setCountry] = useState<CountryCode>(initial.country);
  const [text, setText] = useState(initial.text);
  // Prefilled values (e.g. a stored legacy number) are validated straight away.
  const [touched, setTouched] = useState(() => Boolean(initial.text.trim()));
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    const next = splitValue(value, country);
    setCountry(next.country);
    setText(next.text);
    setTouched(Boolean(next.text.trim()));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  function emit(nextText: string, nextCountry: CountryCode) {
    const trimmed = nextText.trim();
    let out = '';
    let valid = false;
    if (trimmed) {
      const result = normalizeWhatsAppNumber(trimmed, { defaultCountry: nextCountry });
      valid = result.ok;
      out = result.ok ? result.e164 : trimmed;
    }
    lastEmitted.current = out;
    onChange(out, { valid, country: nextCountry });
  }

  function handleTextChange(raw: string) {
    const cleaned = raw.replace(/[^\d+\s\-().]/g, '');
    const compact = cleaned.replace(/[^\d+]/g, '');
    const looksInternational = compact.startsWith('+') || compact.startsWith('00');
    if (looksInternational) {
      const result = normalizeWhatsAppNumber(compact);
      if (result.ok && result.country) {
        const dial = getCountryCallingCode(result.country);
        const national = formatWhatsAppNumber(result.e164).replace(`+${dial}`, '').trim();
        setCountry(result.country);
        setText(national);
        emit(national, result.country);
        return;
      }
    }
    setText(cleaned);
    emit(cleaned, country);
  }

  function handleCountryChange(next: CountryCode) {
    setCountry(next);
    emit(text, next);
  }

  const trimmed = text.trim();
  const current = trimmed ? normalizeWhatsAppNumber(trimmed, { defaultCountry: country }) : null;
  const isValid = Boolean(current?.ok);
  const suggestion = useMemo(() => {
    if (!trimmed || isValid) return null;
    const recovered = normalizeWhatsAppNumber(trimmed, { defaultCountry: country, allowRecovery: true });
    return recovered.ok && recovered.country && recovered.country !== country ? recovered : null;
  }, [trimmed, isValid, country]);

  const showInvalid = Boolean(trimmed) && !isValid && touched;
  const message = error ?? (showInvalid
    ? `This isn't a valid ${countryName(country)} mobile number. Check the country code on the left.`
    : null);

  return (
    <div>
      <div
        className={`flex items-center gap-2 focus-within:border-teal-brand focus-within:ring-1 focus-within:ring-teal-brand ${className} ${
          message ? 'border-red-400 ring-1 ring-red-400' : ''
        } ${disabled ? 'opacity-60' : ''}`}
      >
        {/* Input comes first in the DOM so a wrapping <label> focuses it, not the country picker. */}
        <input
          id={inputId}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          required={required}
          disabled={disabled}
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={country === 'PH' ? '917 123 4567' : 'Mobile number'}
          aria-invalid={Boolean(message)}
          className="order-3 min-w-0 flex-1 border-0 bg-transparent p-0 text-inherit outline-none placeholder:text-charcoal-brand/30 focus:ring-0"
        />
        <span aria-hidden className="order-2 h-5 w-px shrink-0 bg-current opacity-15" />
        <CountryPicker
          country={country}
          disabled={disabled}
          onSelect={(next) => {
            handleCountryChange(next);
            document.getElementById(inputId)?.focus();
          }}
        />
      </div>
      {message && <p className="mt-1 text-[11px] text-red-500">{message}</p>}
      {suggestion?.ok && (
        <button
          type="button"
          onClick={() => {
            setTouched(true);
            handleTextChange(suggestion.e164);
          }}
          className="mt-1 text-left text-[11px] font-medium text-teal-brand underline"
        >
          Did you mean {formatWhatsAppNumber(suggestion.e164)} ({countryName(suggestion.country!)})?
        </button>
      )}
      {!message && showPreview && isValid && current?.ok && (
        <p className="mt-1 text-[11px] text-green-700">
          We&apos;ll message you on WhatsApp at {formatWhatsAppNumber(current.e164)}
        </p>
      )}
      {!message && !(showPreview && isValid) && helperText && (
        <p className="mt-1 text-[11px] leading-snug text-charcoal-brand/45">{helperText}</p>
      )}
    </div>
  );
}
