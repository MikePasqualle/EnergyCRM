export async function register() {
  // Telegram-бот працює в тому самому процесі, що й сайт (long polling)
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NODE_ENV !== 'test') {
    const { startTelegram } = await import('./server/agent/telegram')
    void startTelegram().catch((e) => console.error('[telegram] запуск', e))
  }
}
