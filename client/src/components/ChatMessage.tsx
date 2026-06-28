import { Copy, Check } from 'lucide-react'
import { useState } from 'react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

function renderContent(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-genie-gold font-semibold">{part.slice(2, -2)}</strong>
    }
    return <span key={i}>{part}</span>
  })
}

function formatMessage(content: string) {
  const lines = content.split('\n')
  const result: JSX.Element[] = []
  let inList = false
  let listItems: string[] = []
  let key = 0

  const flushList = () => {
    if (listItems.length > 0) {
      result.push(
        <ul key={key++} className="list-disc pl-5 space-y-1 mb-2">
          {listItems.map((item, i) => (
            <li key={i} className="text-sm">{renderContent(item)}</li>
          ))}
        </ul>
      )
      listItems = []
      inList = false
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushList()
      result.push(<div key={key++} className="h-2" />)
      continue
    }

    const bulletMatch = trimmed.match(/^[-•*]\s+(.+)/)
    const numberedMatch = trimmed.match(/^\d+\.\s+(.+)/)

    if (bulletMatch || numberedMatch) {
      inList = true
      listItems.push((bulletMatch?.[1] || numberedMatch?.[1])!)
    } else {
      flushList()
      result.push(
        <p key={key++} className="text-sm leading-relaxed mb-1">
          {renderContent(trimmed)}
        </p>
      )
    }
  }

  flushList()
  return result
}

export default function ChatMessage({ message }: { message: Message }) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={`flex items-start gap-3 group ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
          isUser ? 'bg-genie-gold/20 border border-genie-gold/40' : 'bg-genie-gradient'
        }`}
      >
        {isUser ? '👤' : '🧞'}
      </div>

      <div className={`max-w-[80%] flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl px-4 py-3 ${
            isUser
              ? 'bg-genie-gold/10 border border-genie-gold/20 rounded-tr-sm'
              : 'bg-genie-brown border border-genie-mid rounded-tl-sm'
          }`}
        >
          {isUser ? (
            <p className="text-sm text-genie-cream leading-relaxed">{message.content}</p>
          ) : (
            <div className="text-genie-cream">{formatMessage(message.content)}</div>
          )}
        </div>

        <div className={`flex items-center gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
          <span className="text-xs text-genie-tan/50 px-1">
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {!isUser && (
            <button
              onClick={copyToClipboard}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-genie-tan/50 hover:text-genie-tan"
              title="Copy response"
            >
              {copied ? <Check className="w-3 h-3 text-genie-gold" /> : <Copy className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
