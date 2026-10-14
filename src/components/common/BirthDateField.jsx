/* eslint-disable react/prop-types -- small internal field, props documented below */
import { useEffect, useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { darkPopoverCalendarClassNames } from '@/lib/darkPopoverCalendar';
import { normalizeBirthDateInput, formatBirthDateForDisplay, MIN_BIRTH_YEAR } from '@/lib/birthDate';
import { cn } from '@/lib/utils';
import { format, parseISO, isValid } from 'date-fns';

/**
 * Birth date: type it or pick it.
 *
 * Every formative-evaluation tester found the calendar-only control
 * inconvenient — it was the lowest-scoring task. The primary typed form is
 * 19900512; separators are accepted and normalized away. The calendar remains
 * as a secondary affordance behind the icon button.
 *
 * `value` and `onChange` always speak the stored format, yyyy-MM-dd.
 *
 * @param {{
 *   id?: string,
 *   value: string,
 *   onChange: (iso: string) => void,
 *   invalid?: boolean,
 * }} props
 */
export default function BirthDateField({ id, value, onChange, invalid = false }) {
  const [text, setText] = useState(formatBirthDateForDisplay(value));
  const [open, setOpen] = useState(false);
  const [localError, setLocalError] = useState(false);

  // Follow external changes — e.g. the edit modal opening on another patient.
  useEffect(() => {
    setText(formatBirthDateForDisplay(value));
    setLocalError(false);
  }, [value]);

  const commit = (raw) => {
    if (!raw.trim()) {
      setLocalError(false);
      onChange('');
      return;
    }
    const iso = normalizeBirthDateInput(raw);
    if (iso) {
      setLocalError(false);
      setText(iso);
      onChange(iso);
    } else {
      setLocalError(true);
    }
  };

  const showError = invalid || localError;
  const selected = value && isValid(parseISO(value)) ? parseISO(value) : undefined;

  return (
    <div>
      <div className="flex gap-2">
        <Input
          id={id}
          inputMode="numeric"
          placeholder="19900512"
          value={text}
          aria-invalid={showError}
          onChange={(e) => {
            setText(e.target.value);
            if (localError) setLocalError(false);
          }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(e.currentTarget.value);
            }
          }}
          className={cn(
            'h-12 flex-1 rounded-xl border bg-[#0D1117] text-white placeholder:text-[#6E7681]',
            showError
              ? 'border-red-500 ring-1 ring-red-500/35'
              : 'border-[#30363D] hover:border-[#8B949E]/50 focus:border-[#3B82F6]'
          )}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="달력에서 선택"
              className="h-12 w-12 shrink-0 rounded-xl border-[#30363D] bg-[#252A32] text-[#C9D1D9] hover:bg-[#30363D] hover:text-white"
            >
              <CalendarIcon className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto border border-[#30363D] bg-[#1C2128] p-0 text-white"
            align="end"
            sideOffset={8}
          >
            {/*
              Arrows and dropdowns together. The dropdown caption needs
              classNames this project has to supply itself (rdp's own
              stylesheet is not loaded) — see darkPopoverCalendar.js.
            */}
            <Calendar
              mode="single"
              captionLayout="dropdown-buttons"
              fromYear={MIN_BIRTH_YEAR}
              toYear={new Date().getFullYear()}
              selected={selected}
              defaultMonth={selected ?? new Date()}
              onSelect={(date) => {
                const iso = date ? format(date, 'yyyy-MM-dd') : '';
                setText(iso);
                setLocalError(false);
                onChange(iso);
                setOpen(false);
              }}
              initialFocus
              className="rounded-md border-0 bg-transparent text-white"
              classNames={darkPopoverCalendarClassNames}
            />
          </PopoverContent>
        </Popover>
      </div>
      <p className={cn('mt-1.5 text-xs', showError ? 'text-[#EF4444]' : 'text-[#8B949E]')}>
        {showError ? '생년월일을 확인해 주세요. 예: 19900512' : '예: 19900512 (구분자 입력 가능)'}
      </p>
    </div>
  );
}
