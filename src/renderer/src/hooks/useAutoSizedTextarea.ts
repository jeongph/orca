import { useCallback, useLayoutEffect, useRef } from 'react'

function sizeToContent(textarea: HTMLTextAreaElement): void {
  // Why: collapse first so a shrinking value re-measures instead of keeping the taller height.
  textarea.style.height = 'auto'
  textarea.style.height = `${textarea.scrollHeight}px`
}

/**
 * Keeps a textarea's height matched to its content.
 *
 * Why: an `onInput` handler only covers text the user types — a value written from
 * React state (prefilling a note from a linked PR, restoring a draft) fires no input
 * event, so the field would keep its `rows` height and clip everything below it. Pair
 * with a `max-h-*` plus a scrollable overflow so long content clamps instead of growing
 * without bound.
 */
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
