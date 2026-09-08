import React from 'react';
import { ArrowLeft, Home } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '@/utils';
import { cn } from '@/lib/utils';

/**
 * Patient-flow header.
 *
 * The back control used to be an unlabelled ghost icon at #8B949E on #0D1117,
 * and there was no home control anywhere in the patient flow — both were
 * raised in the formative evaluation (#8). Back is now labelled and bordered,
 * home is always present, and each is a 44px touch target.
 *
 * Fixing it here means every patient screen inherits it; no call site changes.
 */
export function PatientFlowPageHeader({ backHref, title, patient, trailing = null, className }) {
  const navButton =
    'h-11 shrink-0 gap-1.5 rounded-xl border-[#30363D] bg-[#252A32] px-3 text-[#C9D1D9] hover:bg-[#30363D] hover:text-white';

  return (
    <div
      className={cn(
        'sticky top-0 z-20 mb-4 flex items-center justify-between gap-3 bg-[#0D1117] py-2',
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Button asChild variant="outline" className={navButton}>
          <Link to={backHref} aria-label="뒤로 가기">
            <ArrowLeft className="h-5 w-5" />
            <span className="text-sm font-semibold">뒤로</span>
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-white">{title}</h1>
          {patient && (
            <p className="truncate text-sm text-[#8B949E]">
              {patient.name} • {patient.patient_code}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {trailing}
        <Button asChild variant="outline" className={navButton}>
          <Link to={createPageUrl('Home')} aria-label="홈으로 이동">
            <Home className="h-5 w-5" />
            <span className="text-sm font-semibold">홈</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
