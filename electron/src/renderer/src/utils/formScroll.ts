import type { FormInstance } from 'antd/es/form'
import type { NamePath } from 'antd/es/form/interface'

const SCROLL_OPTS = { behavior: 'smooth' as const, block: 'center' as const }

/** Scroll the page to an element id (e.g. a Card wrapping a line form). */
export function scrollToElementId(id: string): void {
  requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView(SCROLL_OPTS)
  })
}

/** Scroll to a form field and optionally focus it. */
export function scrollToFormField(form: FormInstance, name: NamePath): void {
  requestAnimationFrame(() => {
    form.scrollToField(name, SCROLL_OPTS)
  })
}

/** Set a field error message, then scroll/focus that field. */
export function focusFormFieldError(
  form: FormInstance,
  name: NamePath,
  error: string
): void {
  form.setFields([{ name, errors: [error] }])
  scrollToFormField(form, name)
}

/** Scroll to the first field reported by a failed validateFields() call. */
export function scrollToFirstFormError(
  form: FormInstance,
  err: unknown
): void {
  const name = (err as { errorFields?: { name: NamePath }[] })?.errorFields?.[0]?.name
  if (name != null) scrollToFormField(form, name)
}

/** validateFields + scroll to the first error on failure. */
export async function validateAndScroll<T = any>(
  form: FormInstance,
  nameList?: NamePath[]
): Promise<T> {
  try {
    return (await form.validateFields(nameList)) as T
  } catch (err) {
    scrollToFirstFormError(form, err)
    throw err
  }
}
