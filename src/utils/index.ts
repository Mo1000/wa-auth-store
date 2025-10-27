export function getRedisKeyWhatsapp(sessionId: string) {
  return {
    CREDENTIALS: `wa:auth:${sessionId}:creds`,
    KEYS: `wa:auth:${sessionId}:keys`,
  };
}
