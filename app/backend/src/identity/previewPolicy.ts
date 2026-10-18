export function isUnpaidPreviewEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SOAR_DISABLE_PAYMENTS?.trim().toLowerCase() === 'true';
}
