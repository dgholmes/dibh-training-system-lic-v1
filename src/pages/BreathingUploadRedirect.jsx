import { Navigate, useSearchParams } from 'react-router-dom';
import { createPageUrl, getPatientIdFromSearchParams } from '@/utils';

/**
 * Upload and file selection merged into one screen (formative evaluation #9),
 * so /BreathingDataUpload no longer exists. This keeps older deep links and
 * any bookmarked URLs working.
 */
export default function BreathingUploadRedirect() {
  const [searchParams] = useSearchParams();
  const patientId = getPatientIdFromSearchParams(searchParams);
  const target = patientId
    ? `${createPageUrl('AnalysisFileSelect')}?patientId=${encodeURIComponent(patientId)}`
    : createPageUrl('Home');
  return <Navigate to={target} replace />;
}
