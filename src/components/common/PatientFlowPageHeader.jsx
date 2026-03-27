import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Matches InitialDiagnosis / TypeDecision: back, title (text-xl), optional patient line.
 * Optional `trailing` for right-side content (e.g. TrainingMonitor type badge).
 */
export function PatientFlowPageHeader({ backHref, title, patient, trailing = null, className }) {
  return (
    <div
      className={cn(
        'mb-4 flex items-center gap-4',
        trailing ? 'justify-between' : null,
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-4">
        <Link to={backHref}>
          <Button
            variant="ghost"
            size="icon"
            className="text-[#8B949E] hover:bg-[#1C2128] hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">{title}</h1>
          {patient && (
            <p className="text-sm text-[#8B949E]">
              {patient.name} • {patient.patient_code}
            </p>
          )}
        </div>
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}
