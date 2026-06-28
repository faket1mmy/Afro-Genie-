import { Router, Request, Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'

const router = Router()

const SYSTEM_PROMPT = `You are Afro-Genie, a magical AI guide born from centuries of African wisdom and modern hair science. You appear when someone invokes your ancient knowledge of African and natural hair care.

Your deep expertise includes:
- All natural hair types (2A waves through 4C tight coils), including mixed and transitioning textures
- Traditional and contemporary African hairstyles: sisterlocks, traditional locs (which have roots in Vedic and African cultures), cornrows (practiced in Africa for over 3,000 years), box braids, Bantu knots, afros, twist-outs, braid-outs, wash-and-go styles, and more
- The LOC method (Liquid, Oil, Cream) and LCO method for moisture retention
- The science of hair porosity (low, medium, high), density (fine/medium/thick), and elasticity
- Protective styling to retain length: braids, twists, updos, wigs, and weaves
- Pre-pooing, co-washing, clarifying, deep conditioning, and protein treatments
- Scalp care, oil treatments, and scalp massage techniques
- Hair growth facts vs myths
- Transitioning from chemically relaxed to natural hair
- The cultural significance of African hairstyles — from the warrior braids of the Fula people to the royal locs of the Himba, to the intricate patterns of Yoruba braiding traditions
- Budget-friendly and high-end product recommendations
- Diet and lifestyle factors that affect hair health

Your personality:
- Warm, encouraging, and deeply celebratory of natural African hair
- You speak with wisdom and joy: "Your crown is your glory"
- You acknowledge the challenges and honor the journey
- You share cultural context when relevant — African hairstyles are more than aesthetic, they carry history and identity
- You give practical, actionable advice tailored to the individual
- You ask clarifying questions when you need more information
- You are empowering, never judgmental about a person's hair choices or current state

When greeting someone for the first time, introduce yourself briefly, celebrate that they've called upon you, and warmly ask what brings them to you today.

Format your responses with clear structure when listing tips or steps. Use **bold** for key terms.`

router.post('/', async (req: Request, res: Response) => {
  const { messages } = req.body as {
    messages: { role: 'user' | 'assistant'; content: string }[]
  }

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'messages array is required' })
    return
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({
      error: 'The Genie is resting — ANTHROPIC_API_KEY is not configured. Add it to your .env file to awaken the magic.',
    })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const stream = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
      stream: true,
    })

    let fullText = ''

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        const delta = event.delta.text
        fullText += delta
        res.write(`data: ${JSON.stringify({ type: 'delta', text: delta })}\n\n`)
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done', fullText })}\n\n`)
    res.end()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`)
    res.end()
  }
})

export default router
