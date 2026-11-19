import 'server-only'
import { revalidatePath } from 'next/cache'

/** Скидання кешу сторінок. Поза запитом (наприклад, у Telegram-боті) Next кидає виняток — тут він безпечно ігнорується. */
export function reval(...paths: string[]) {
  for (const p of paths) {
    try { revalidatePath(p) } catch { /* виклик поза контекстом запиту */ }
  }
}
