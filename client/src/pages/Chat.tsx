import { useState, useRef, useEffect } from 'react'
import { RefreshCw, Sparkles, AlertCircle } from 'lucide-react'
import ChatMessage from '../components/ChatMessage'
import ChatInput from '../components/ChatInput'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const SUGGESTED_QUESTIONS = [
  "What's the best daily routine for 4C hair?",
  "How do I retain moisture between wash days?",
  "What protective styles work for short natural hair?",
  "How do I start my loc journey?",
  "What's the difference between low and high porosity hair?",
]

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingText])

  const sendMessage = async (content: string) => {
    if (isStreaming) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    }

    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setIsStreaming(true)
    setStreamingText('')
    setError(null)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to connect to Genie')
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const payload = JSON.parse(line.slice(6))
            if (payload.type === 'delta') {
              setStreamingText((prev) => prev + payload.text)
            } else if (payload.type === 'done') {
              setMessages((prev) => [
                ...prev,
                {
                  id: `assistant-${Date.now()}`,
                  role: 'assistant',
                  content: payload.fullText,
                  timestamp: new Date(),
                },
              ])
              setStreamingText('')
              setIsStreaming(false)
            } else if (payload.type === 'error') {
              throw new Error(payload.message)
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setIsStreaming(false)
      setStreamingText('')
    }
  }

  const clearChat = () => {
    setMessages([])
    setStreamingText('')
    setError(null)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-genie-dark">
      {/* Header */}
      <div className="border-b border-genie-mid px-4 py-3 flex items-center justify-between bg-genie-dark/90 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-genie-gold" />
          <span className="font-display font-semibold text-genie-cream">
            Afro-Genie Chat
          </span>
          {isStreaming && (
            <span className="text-xs text-genie-gold animate-pulse ml-1">
              Channeling wisdom...
            </span>
          )}
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 text-xs text-genie-tan hover:text-genie-cream transition-colors px-2 py-1 rounded-md hover:bg-genie-brown"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            New Chat
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
          {messages.length === 0 && !isStreaming ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-genie-gradient flex items-center justify-center text-5xl shadow-lg animate-float">
                  🧞
                </div>
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-genie-gold flex items-center justify-center animate-pulse-gold">
                  <Sparkles className="w-3.5 h-3.5 text-genie-dark" />
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="font-display text-2xl font-bold text-genie-cream">
                  Your Crown Awaits
                </h2>
                <p className="text-genie-tan max-w-sm mx-auto text-sm leading-relaxed">
                  I am Afro-Genie, keeper of ancient hair wisdom. Ask me anything about
                  natural hair care, styles, and African hair traditions.
                </p>
              </div>

              <div className="w-full max-w-md space-y-2">
                <p className="text-xs text-genie-tan/60 font-medium uppercase tracking-wider mb-3">
                  Suggested questions
                </p>
                {SUGGESTED_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(q)}
                    className="w-full text-left px-4 py-3 rounded-xl bg-genie-brown border border-genie-mid hover:border-genie-gold/50 hover:bg-genie-mid text-sm text-genie-cream transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}

              {/* Streaming message bubble */}
              {isStreaming && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-genie-gradient flex items-center justify-center text-sm flex-shrink-0">
                    🧞
                  </div>
                  <div className="max-w-[80%]">
                    <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-genie-brown border border-genie-mid">
                      {streamingText ? (
                        <p className="text-sm text-genie-cream leading-relaxed whitespace-pre-wrap">
                          {streamingText}
                          <span className="inline-block w-0.5 h-4 bg-genie-gold ml-0.5 animate-pulse align-middle" />
                        </p>
                      ) : (
                        <div className="flex gap-1 py-1">
                          <span className="w-2 h-2 bg-genie-gold rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 bg-genie-gold rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 bg-genie-gold rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-red-950/30 border border-red-800/40">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <ChatInput onSend={sendMessage} disabled={isStreaming} />
    </div>
  )
}
