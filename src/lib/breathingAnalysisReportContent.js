/** Copy for 종합 호흡 분석 진단리포트 + modal (Type A/B/C). */

export const REPORT_CARD_COPY = {
  A: {
    typeLabel: 'DIBH',
    summary: "현재 환자는 'DIBH' 가능 상태입니다.",
    bullets: [
      '호흡주기 : 3~6초 사이에서 오차 없이 매우 일정함',
      '흡기 및 호기 비율 : 1:1.2~1.5 비율을 정확히 준수함',
      '호흡의 깊이 변동률 : 진폭 오차 ±10% 이내로 완벽히 억제됨',
      '주기변동 : 오차 ±0.5초 이내로 주기 변동이 거의 없음',
    ],
    boxClass: 'border-[#22C55E] bg-[#0D1117]',
    typeSmallClass: 'text-[#22C55E]/80',
    letterClass: 'text-[#22C55E]',
  },
  B: {
    typeLabel: 'Normal Breathing',
    summary: "현재 환자는 '정상 호흡' 상태입니다.",
    bullets: [
      '호흡주기 : 표준 범위인 3~6초 사이를 안정적으로 유지',
      '흡기 및 호기 비율 : 1:1.2~1.5 수준',
      '호흡의 깊이 변동률 : 진폭 ±10% 이내로 안정적',
      '주기변동 : ±0.5초 이내로 안정적',
    ],
    boxClass: 'border-[#EAB308] bg-[#0D1117]',
    typeSmallClass: 'text-[#EAB308]/80',
    letterClass: 'text-[#FACC15]',
  },
  C: {
    typeLabel: 'Shallow Breathing',
    summary: "현재 환자는 호흡이 다소 빠르고 얕은 '얕은 호흡' 상태입니다.",
    bullets: [
      '호흡주기 : 2~4초 사이로 표준 범위(3~6초) 대비 단축됨',
      '흡기 및 호기 비율 : 호기 시간이 다소 부족하여 불규칙함',
      '호흡의 깊이 변동률 : 목표 진폭에 도달하지 못해 변동성 발생',
      '주기변동 : 잦은 호흡 횟수로 인해 주기 오차 발생 가능성 높음',
    ],
    boxClass: 'border-[#EF4444] bg-[#0D1117]',
    typeSmallClass: 'text-[#EF4444]/80',
    letterClass: 'text-[#EF4444]',
  },
};

export const COMPARISON_MODAL_ROWS = [
  {
    key: 'overall',
    label: '종합 평가',
    A: { text: 'DIBH 가능 상태', color: 'text-[#22C55E]' },
    B: { text: '정상 호흡 상태', color: 'text-[#EAB308]' },
    C: { text: '얕은 호흡 상태', color: 'text-[#EF4444]' },
  },
  {
    key: 'cycle',
    label: '호흡 주기',
    A: '3~6초 사이에서 오차 없이\n매우 일정함',
    B: '표준 범위인 3~6초 사이를\n안정적으로 유지',
    C: '2~4초 사이로 표준 범위(3~6초)\n대비 단축됨',
  },
  {
    key: 'ratio',
    label: '흡기 및 호기 비율',
    A: '1 : 1.2 ~ 1.5 비율을\n거의 정확하게 준수함',
    B: '1 : 1.2 ~ 1.5 수준',
    C: '호기 시간이 다소 부족하여\n불규칙함',
  },
  {
    key: 'depth',
    label: '호흡 깊이 변동률',
    A: '진폭 오차 ±10% 이내로\n완벽히 억제됨',
    B: '진폭 ±10% 이내로 안정적',
    C: '목표 진폭에 도달하지 못해\n변동성 발생',
  },
  {
    key: 'period',
    label: '주기 변동',
    A: '±0.5초 이내로\n주기 변동이 거의 없음',
    B: '±0.5초 이내로 안정적',
    C: '잦은 호흡 횟수로 인해\n주기 오차 발생 가능성 높음',
  },
];

/**
 * Type-specific next steps (formative evaluation #5 — the result screen said
 * what the type was but not what to do about it).
 *
 * DRAFT — pending clinical review by the 더픽트 clinical team. Phrased as a
 * suggestion, never an instruction: RM-DBF-007 (over-reliance on the analysis)
 * and RM-DBF-014 (misreading the result) are the risks that directive wording
 * makes worse. Keep CLINICAL_DISCLAIMER displayed alongside.
 */
export const RECOMMENDED_ACTIONS = {
  A: {
    headline: 'DIBH 치료 계획 수립을 고려할 수 있습니다',
    steps: [
      '호흡 유지 시간과 안정성이 DIBH 기준을 충족합니다.',
      '동일 조건에서 1회 더 측정하여 재현성을 확인하는 것을 권장합니다.',
      '치료 계획 수립 시 실제 호흡 유지 가능 시간을 함께 검토해 주세요.',
    ],
  },
  B: {
    headline: '추가 훈련 후 재평가를 고려할 수 있습니다',
    steps: [
      '호흡은 안정적이나 DIBH 기준에는 도달하지 않았습니다.',
      '호흡 유지 훈련을 진행한 뒤 재측정하는 것을 권장합니다.',
      '재측정 시 측정 조건(자세·시간대)을 이전과 동일하게 유지해 주세요.',
    ],
  },
  C: {
    headline: '호흡 안정화가 우선 필요할 수 있습니다',
    steps: [
      '호흡이 짧고 변동이 커 현재 조건에서는 DIBH 적용이 어려울 수 있습니다.',
      '호흡 안정화 훈련을 먼저 진행하는 것을 권장합니다.',
      '측정 중 환자 상태나 자세에 문제가 없었는지 확인 후 재측정을 고려해 주세요.',
    ],
  },
};

/** Shown with every recommendation — the analysis supports, never replaces, clinical judgement. */
export const CLINICAL_DISCLAIMER =
  '본 결과는 참고 정보이며, 최종 치료 방침은 담당 의료진의 판단에 따릅니다.';
