/* eslint-disable react/prop-types -- small internal field, props documented below */
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserStore } from '@/api/authStore';

const MANUAL = '__manual__';

/**
 * Doctor assignment. Free-text entry produced spelling variants and duplicate
 * names (formative evaluation #3), so the default is a registered account.
 * "직접 입력" stays available for a physician without an account.
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
  const [loaded, setLoaded] = useState(false);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    let alive = true;
    UserStore.list()
      .then((list) => {
        if (!alive) return;
        setAccounts(list.map(({ id, username, displayName }) => ({ id, username, displayName })));
        setLoaded(true);
      })
      .catch((err) => {
        console.error('[DoctorSelectField] account list failed:', err);
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // A stored doctor whose account no longer exists (or was always free text)
  // must keep showing — falling back to manual preserves the record.
  const known = accounts.some((a) => a.id === accountId);
  const orphaned = loaded && !accountId && !!name;
  const staleAccount = loaded && !!accountId && !known;
  const showManual = manual || orphaned || staleAccount;

  const selectValue = showManual ? MANUAL : accountId || '';

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
          const picked = accounts.find((a) => a.id === v);
          setManual(false);
          onChange({ name: picked?.displayName || '', accountId: v });
        }}
      >
        <SelectTrigger className="h-12 rounded-xl border-[#30363D] bg-[#0D1117] text-white hover:border-[#8B949E]/50">
          <SelectValue placeholder="담당 의사를 선택하세요" />
        </SelectTrigger>
        <SelectContent className="border-[#30363D] bg-[#1C2128] text-white">
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id} className="focus:bg-[#30363D] focus:text-white">
              {a.displayName} ({a.username})
            </SelectItem>
          ))}
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
