
/** URLSearchParams keys are case-sensitive (patientId vs patientid). */
export function getPatientIdFromSearchParams(searchParams: URLSearchParams): string {
  return (
    searchParams.get('patientId') ||
    searchParams.get('patientid') ||
    searchParams.get('id') ||
    ''
  );
}

export function createPageUrl(pageName: string) {
    return '/' + pageName.toLowerCase().replace(/ /g, '-');
}