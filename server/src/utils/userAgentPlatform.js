/** Return platform name from User-Agent for TTS (e.g. "Android", "MacBook", "iPhone"). */
export function getPlatformHint(userAgent) {
  if (!userAgent || typeof userAgent !== "string") return null;
  const ua = userAgent.slice(0, 300);
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh|Mac OS X|Mac_PowerPC/i.test(ua)) return "MacBook";
  if (/Windows NT|Windows /i.test(ua)) return "Windows";
  if (/CrOS/i.test(ua)) return "Chrome OS";
  if (/Linux/i.test(ua)) return "Linux";
  return null;
}
