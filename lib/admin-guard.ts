/**
 * 재인증 API 보호: 이 플로우를 아무나 밟으면 남의 계정을 꽂아버릴 수 있으므로
 * TECHTALK_ADMIN_CODE 환경변수가 설정된 경우 x-admin-code 헤더 일치를 요구한다.
 * (미설정이면 로컬 개발로 간주하고 통과)
 */
export function isAdminAuthorized(req: Request): boolean {
  const code = process.env.TECHTALK_ADMIN_CODE;
  if (!code) return true;
  return req.headers.get("x-admin-code") === code;
}
