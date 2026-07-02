// Password strength rules — MFDS IA-05

export function validatePassword(password) {
  const errors = [];
  if (!password || password.length < 8) errors.push('8자 이상이어야 합니다');
  if (!/[A-Z]/.test(password)) errors.push('대문자(A-Z)를 포함해야 합니다');
  if (!/[a-z]/.test(password)) errors.push('소문자(a-z)를 포함해야 합니다');
  if (!/[0-9]/.test(password)) errors.push('숫자(0-9)를 포함해야 합니다');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('특수문자(!@#$ 등)를 포함해야 합니다');
  return errors;
}

export function isPasswordValid(password) {
  return validatePassword(password).length === 0;
}
