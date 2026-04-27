import { Navigate, useSearchParams } from 'react-router-dom';
import { createPageUrl, getPatientIdFromSearchParams } from '@/utils';

/**
 * Live belt / VR training flows are deferred (file-only analysis).
 * Old bookmarks deep-link here; send users to the patient dashboard or home.
 */
export default function LegacyFlowRedirect() {
  const [searchParams] = useSearchParams();
  const patientId = getPatientIdFromSearchParams(searchParams);
  const to = patientId
    ? `${createPageUrl('PatientDashboard')}?patientId=${encodeURIComponent(patientId)}`
    : createPageUrl('Home');
  return <Navigate to={to} replace />;
}
