import { useState, KeyboardEvent, useRef, useEffect } from 'react'
import { Send, Loader2 } from 'lucide-react'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
  }, [value])

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-genie-mid bg-genie-dark px-4 py-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end gap-3 bg-genie-brown border border-genie-mid focus-within:border-genie-gold/50 rounded-2xl px-4 py-3 transition-colors">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the Genie about your hair..."
            disabled={disabled}
            rows={1}
            className="flex-1 bg-transparent text-genie-cream placeholder-genie-tan/40 outline-none resize-none text-sm leading-relaxed disabled:opacity-50"
            style={{ maxHeight: '120px' }}
          />
          <button
            onClick={handleSend}
            disabled={!value.trim() || disabled}
            className="w-9 h-9 rounded-xl bg-genie-gradient hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-opacity flex-shrink-0"
            title="Send message"
          >
            {disabled ? (
              <Loader2 className="w-4 h-4 text-genie-dark animate-spin" />
            ) : (
              <Send className="w-4 h-4 text-genie-dark" />
            )}
          </button>
        </div>
        <p className="text-xs text-genie-tan/30 mt-2 text-center">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
