/* eslint-disable react/prop-types -- small internal field, props documented below */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserStore } from '@/api/authStore';
import { listDoctorRoster, forgetDoctorName } from '@/api/doctorRosterStore';

const MANUAL = '__manual__';
/** Prefix marking a remembered free-text name, so it cannot collide with an account id. */
const TYPED = 'typed:';

/**
 * Doctor assignment. Free-text entry produced spelling variants and duplicate
 * names (formative evaluation #3), so the default is a registered account.
 *
 * Names entered through 직접 입력 are remembered and offered under their own
 * heading, so a physician without a login does not have to be retyped for
 * every patient. They stay visually separate from accounts because they are
 * not accounts — nobody logs in as one, and nothing validates the spelling.
 * Each remembered name carries an × so a mistyped one can be cleared instead
 * of waiting for it to age off the cap.
 *
 * Only id/username/displayName are kept off the account list. UserStore.list()
 * also returns role and lockout state — this component drops those immediately
 * and never renders them, so a clinician sees colleague names and nothing more.
 *
 * @param {{
 *   name: string,
 *   accountId: string,
 *   onChange: (next: {name: string, accountId: string}) => void,
 * }} props
 */
export default function DoctorSelectField({ name, accountId, onChange }) {
  const [accounts, setAccounts] = useState([]);
  const [remembered, setRemembered] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([UserStore.list(), listDoctorRoster()])
      .then(([list, roster]) => {
        if (!alive) return;
        setAccounts(list.map(({ id, username, displayName }) => ({ id, username, displayName })));
        setRemembered(roster);
        setLoaded(true);
      })
      .catch((err) => {
        console.error('[DoctorSelectField] doctor options failed to load:', err);
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // A stored doctor whose account no longer exists (or was always free text)
  // must keep showing — falling back to a remembered entry, or to the manual
  // field, preserves the record either way.
  const known = accounts.some((a) => a.id === accountId);
  const rememberedMatch = loaded && !accountId && !!name && remembered.includes(name);
  const orphaned = loaded && !accountId && !!name && !rememberedMatch;
  const staleAccount = loaded && !!accountId && !known;
  const showManual = manual || orphaned || staleAccount;

  const handleForget = async (n) => {
    setRemembered((prev) => prev.filter((x) => x !== n));
    try {
      await forgetDoctorName(n);
    } catch (err) {
      console.error('[DoctorSelectField] could not forget name:', err);
      setRemembered(await listDoctorRoster());
    }
  };

  const selectValue = showManual
    ? MANUAL
    : rememberedMatch
      ? `${TYPED}${name}`
      : accountId || '';

  return (
    <div className="space-y-2">
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === MANUAL) {
            setManual(true);
            onChange({ name: '', accountId: '' });
            return;
          }
          setManual(false);
          if (v.startsWith(TYPED)) {
            // A remembered free-text name: no account behind it.
            onChange({ name: v.slice(TYPED.length), accountId: '' });
            return;
          }
          const picked = accounts.find((a) => a.id === v);
          onChange({ name: picked?.displayName || '', accountId: v });
        }}
      >
        <SelectTrigger className="h-12 rounded-xl border-[#30363D] bg-[#0D1117] text-white hover:border-[#8B949E]/50">
          <SelectValue placeholder="담당 의사를 선택하세요" />
        </SelectTrigger>
        <SelectContent className="border-[#30363D] bg-[#1C2128] text-white">
          {accounts.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-xs font-semibold text-[#8B949E]">등록 계정</SelectLabel>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id} className="focus:bg-[#30363D] focus:text-white">
                  {a.displayName} ({a.username})
                </SelectItem>
              ))}
            </SelectGroup>
          )}

          {remembered.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-xs font-semibold text-[#8B949E]">
                직접 입력 이력
              </SelectLabel>
              {remembered.map((n) => (
                <SelectItem
                  key={n}
                  value={`${TYPED}${n}`}
                  className="focus:bg-[#30363D] focus:text-white"
                  action={
                    <span
                      role="button"
                      tabIndex={-1}
                      aria-label={`${n} 이력에서 삭제`}
                      title="이력에서 삭제"
                      /*
                        Radix selects the row on pointerup, so both pointer
                        events are stopped here — otherwise removing an entry
                        would also assign it to the patient on the way out.
                      */
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onPointerUp={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void handleForget(n);
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded text-[#8B949E] hover:bg-[#30363D] hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </span>
                  }
                >
                  {n}
                </SelectItem>
              ))}
            </SelectGroup>
          )}

          <SelectItem value={MANUAL} className="focus:bg-[#30363D] focus:text-white">
            직접 입력
          </SelectItem>
        </SelectContent>
      </Select>

      {showManual && (
        <Input
          placeholder="담당 의사 이름을 입력하세요"
          value={name}
          onChange={(e) => onChange({ name: e.target.value, accountId: '' })}
          className="h-12 rounded-xl border-[#30363D] bg-[#0D1117] text-white placeholder:text-[#6E7681] hover:border-[#8B949E]/50 focus:border-[#3B82F6]"
        />
      )}
    </div>
  );
}
