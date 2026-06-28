import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import chatRouter from './routes/chat'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'

app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors({ origin: CLIENT_URL, credentials: true }))
app.use(express.json({ limit: '1mb' }))

app.use('/api/chat', chatRouter)

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Afro-Genie API',
    apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY,
  })
})

app.listen(PORT, () => {
  console.log(`\n🧞 Afro-Genie server running on http://localhost:${PORT}`)
  console.log(`   API key: ${process.env.ANTHROPIC_API_KEY ? '✅ configured' : '❌ missing — add ANTHROPIC_API_KEY to .env'}`)
  console.log(`   CORS origin: ${CLIENT_URL}\n`)
})
