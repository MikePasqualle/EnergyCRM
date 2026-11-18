import type { FormEvent } from 'react'

/** React 19 очищає неконтрольовані поля після form action — навіть при помилці валідації.
 *  Цей обробник відправляє ті самі FormData через action, але форму не скидає. */
export function noReset(run: (fd: FormData) => void, wrap: (cb: () => void) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const fd = new FormData(e.currentTarget, submitter)
    wrap(() => run(fd))
  }
}
