import { useCallback, useLayoutEffect, useRef } from 'react'

function sizeToContent(textarea: HTMLTextAreaElement): void {
  // Why: collapse first so a shrinking value re-measures instead of keeping the taller height.
  textarea.style.height = 'auto'
  textarea.style.height = `${textarea.scrollHeight}px`
}

/** Why: `onInput` misses values React writes from state, so a prefill would keep the `rows` height. */
export function useAutoSizedTextarea(value: string): (node: HTMLTextAreaElement | null) => void {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useLayoutEffect(() => {
    if (textareaRef.current) {
      sizeToContent(textareaRef.current)
    }
  }, [value])

  return useCallback((node: HTMLTextAreaElement | null) => {
    textareaRef.current = node
    if (node) {
      sizeToContent(node)
    }
  }, [])
}
