import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronLeft, Sparkles } from 'lucide-react'

interface Question {
  id: string
  question: string
  description: string
  options: { value: string; label: string; desc: string; types: string[] }[]
}

const QUESTIONS: Question[] = [
  {
    id: 'texture',
    question: 'What best describes your natural hair texture?',
    description: 'Choose the pattern that most closely matches your hair when air-dried with no products',
    options: [
      { value: 'straight', label: 'Straight', desc: 'No curl or wave pattern', types: ['1A', '1B', '1C'] },
      { value: 'wavy', label: 'Wavy', desc: 'Gentle S-shaped waves', types: ['2A', '2B', '2C'] },
      { value: 'curly', label: 'Curly', desc: 'Defined springy curls', types: ['3A', '3B', '3C'] },
      { value: 'coily', label: 'Coily / Kinky', desc: 'Tight coils or zigzag pattern', types: ['4A', '4B', '4C'] },
    ],
  },
  {
    id: 'coil_size',
    question: 'How tight are your curls or coils?',
    description: 'Compare your natural curl circumference to common objects',
    options: [
      { value: 'loose', label: 'Loose', desc: 'Marker-pen sized or bigger', types: ['2A', '2B', '3A'] },
      { value: 'medium', label: 'Medium', desc: 'Roughly pen-sized', types: ['3A', '3B', '4A'] },
      { value: 'tight', label: 'Tight', desc: 'About pencil-sized', types: ['3C', '4A', '4B'] },
      { value: 'very_tight', label: 'Very Tight', desc: 'Smaller than pencil / zigzag', types: ['4B', '4C'] },
    ],
  },
  {
    id: 'shrinkage',
    question: 'How much does your hair shrink when it dries?',
    description: 'Shrinkage is natural — more shrinkage typically means tighter curl patterns',
    options: [
      { value: 'minimal', label: 'Little / None', desc: 'Stays near the same length', types: ['1A', '1B', '2A', '2B'] },
      { value: 'some', label: 'Some (~25–50%)', desc: 'Noticeable but manageable', types: ['2C', '3A', '3B'] },
      { value: 'significant', label: 'Significant (~50–75%)', desc: 'Hair looks much shorter dry', types: ['3C', '4A', '4B'] },
      { value: 'extreme', label: 'Extreme (75%+)', desc: "Like magic — it disappears!", types: ['4B', '4C'] },
    ],
  },
  {
    id: 'moisture',
    question: 'How does your hair feel without products?',
    description: 'Think about how your hair behaves on an average day with nothing applied',
    options: [
      { value: 'oily', label: 'Gets oily quickly', desc: 'Scalp produces a lot of oil', types: ['1A', '1B', '2A'] },
      { value: 'balanced', label: 'Balanced', desc: 'Not too oily or too dry', types: ['1C', '2B', '3A'] },
      { value: 'dry', label: 'Dry / Frizzy', desc: 'Needs regular moisture', types: ['2C', '3B', '3C', '4A'] },
      { value: 'very_dry', label: 'Very Dry', desc: 'Needs constant moisture to thrive', types: ['4A', '4B', '4C'] },
    ],
  },
  {
    id: 'goal',
    question: 'What is your primary hair goal right now?',
    description: 'This helps Afro-Genie give you the most relevant advice',
    options: [
      { value: 'moisture', label: '💧 Moisture', desc: 'Keep my hair hydrated and soft', types: ['4C', '4B', '4A'] },
      { value: 'length', label: '📏 Length Retention', desc: 'Grow and retain length', types: ['3C', '4A', '4B', '4C'] },
      { value: 'definition', label: '🌀 Curl Definition', desc: 'More defined, bouncy curls', types: ['3A', '3B', '3C', '4A'] },
      { value: 'protective', label: '🛡 Protective Styling', desc: 'Style and protect my hair', types: ['4A', '4B', '4C'] },
      { value: 'health', label: '💚 Overall Health', desc: 'Strengthen and repair my hair', types: ['2C', '3A', '3B'] },
    ],
  },
]

const HAIR_RECOMMENDATIONS: Record<string, { description: string; tips: string[]; styles: string[] }> = {
  '4C': {
    description:
      'Your 4C hair is one of the most unique and beautiful textures — with the tightest curl pattern that can shrink up to 75% of its length. It thrives with intentional moisture and protective styling.',
    tips: [
      'Use the LOC method (Liquid → Oil → Cream) after every wash to lock in moisture',
      'Deep condition weekly or bi-weekly with a moisturizing mask',
      'Detangle gently with your fingers or a wide-tooth comb while hair is wet and saturated with conditioner',
      'Sleep on a satin pillowcase or wear a satin bonnet to prevent breakage',
      'Avoid heat styling frequently — embrace your natural texture',
      'Pre-poo with an oil (coconut, olive, or avocado) before washing to reduce damage',
    ],
    styles: ['Box braids', 'Twist outs', 'Bantu knots', 'Afro puffs', 'Flat twists', 'Locs / Sisterlocks'],
  },
  '4B': {
    description:
      '4B hair features a Z-shaped pattern with less curl definition but enormous volume. It has the perfect structure for protective styles and thrives on regular moisture.',
    tips: [
      'Section hair into 4–6 parts when washing to prevent tangling',
      'Use a creamy, rich conditioner and leave some in as a leave-in',
      'Protective styles help retain length — keep ends tucked away',
      'Avoid over-manipulation; handle hair as little as possible',
      'Protein treatments once a month can strengthen fragile strands',
      'Use a denman brush or flexi-rods for defined styles',
    ],
    styles: ['Flat twists', 'Cornrows', 'Wash and go', 'Braid outs', 'Crochet braids', 'Wigs over braids'],
  },
  '4A': {
    description:
      '4A hair has a defined S-pattern coil about the size of a crochet needle. It holds moisture better than other 4-type hair and is great for wash-and-go styles.',
    tips: [
      'Co-wash (conditioner-only wash) between shampoo days to maintain moisture',
      'Use a gel or custard over your leave-in for defined wash-and-go styles',
      'Shingling technique can maximize definition',
      'Refresh styles with a water and conditioner spray bottle',
      'Avoid touching hair while it dries to prevent frizz',
    ],
    styles: ['Wash and go', 'Twist outs', 'Braid outs', 'Mini twists', 'Puff styles', 'Crochet locs'],
  },
  '3C': {
    description:
      '3C hair has tight, well-defined corkscrew curls roughly pencil-sized. It has great volume and responds well to hydration-focused products.',
    tips: [
      'Use a sulfate-free shampoo to keep natural oils intact',
      'Apply products to soaking wet hair for best definition',
      'Scrunch out the crunch once gel casts dry for soft defined curls',
      'Pineapple your hair at night to preserve the style',
      'Trim every 3–4 months to prevent split ends',
    ],
    styles: ['Wash and go', 'Twist outs', 'Braid outs', 'Puffs', 'Half-up styles', 'Bantu knots'],
  },
  '3B': {
    description:
      '3B curls are springy with a medium circumference. They have beautiful natural volume and respond wonderfully to curl-enhancing creams and gels.',
    tips: [
      'Diffuse or air-dry to enhance your natural curl pattern',
      'Layer a leave-in, curl cream, and light-hold gel for frizz-free results',
      'Deep condition bi-weekly to maintain elasticity and shine',
      'Use a microfiber towel or old t-shirt to gently squeeze out water — no rubbing',
    ],
    styles: ['Wash and go', 'Flexi rod sets', 'Perm rod sets', 'Puffs', 'Half-up half-down'],
  },
  '3A': {
    description:
      '3A curls are loose, shiny, and S-shaped, about the width of a sidewalk chalk stick. They tend toward frizz in humidity and love lightweight moisture.',
    tips: [
      'Less is more with products — avoid heavy creams that weigh curls down',
      'Plop your hair in a microfiber towel for 15–20 minutes after washing',
      'Use a light mousse or gel for hold without crunch',
      'Finger-coil individual curls for more definition',
    ],
    styles: ['Wash and go', 'Braid outs for volume', 'Puff updo', 'Side-swept styles'],
  },
  '2C': {
    description:
      '2C hair has defined waves with some coils forming at the ends. It can be prone to frizz and benefits from lightweight moisturizing products.',
    tips: [
      'Clarify monthly to remove product buildup',
      'Apply styling products in sections while hair is soaking wet',
      'Diffuse on low heat to enhance wave pattern',
      'Avoid touching waves while they dry',
    ],
    styles: ['Beach waves', 'Half-up half-down', 'Braid outs', 'Buns'],
  },
  DEFAULT: {
    description:
      'Your hair is beautiful and unique! Natural hair care is about learning what works for your specific texture and building a consistent routine.',
    tips: [
      'Build a simple routine: cleanse, condition, moisturize, and seal',
      'Listen to your hair — it tells you what it needs',
      'Patience is key — healthy hair habits take time to show results',
      'Stay hydrated and eat a balanced diet for hair health from within',
    ],
    styles: ['Protective styles', 'Natural styles', 'Low-manipulation styles'],
  },
}

function determineHairType(answers: Record<string, string>): string {
  const typeCounts: Record<string, number> = {}

  for (const [questionId, answerId] of Object.entries(answers)) {
    const question = QUESTIONS.find((q) => q.id === questionId)
    const option = question?.options.find((o) => o.value === answerId)
    for (const type of option?.types ?? []) {
      typeCounts[type] = (typeCounts[type] ?? 0) + 1
    }
  }

  if (Object.keys(typeCounts).length === 0) return 'DEFAULT'
  return Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0][0]
}

export default function HairQuiz() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ hairType: string } | null>(null)

  const currentQuestion = QUESTIONS[step]
  const progress = ((step) / QUESTIONS.length) * 100
  const isLastStep = step === QUESTIONS.length - 1

  const handleAnswer = (value: string) => {
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: value }))
  }

  const handleNext = () => {
    if (!answers[currentQuestion.id]) return
    if (isLastStep) {
      const hairType = determineHairType(answers)
      setResult({ hairType })
    } else {
      setStep((prev) => prev + 1)
    }
  }

  const handleBack = () => {
    if (step > 0) setStep((prev) => prev - 1)
  }

  const resetQuiz = () => {
    setStep(0)
    setAnswers({})
    setResult(null)
  }

  if (result) {
    const recs = HAIR_RECOMMENDATIONS[result.hairType] ?? HAIR_RECOMMENDATIONS['DEFAULT']
    return (
      <div className="min-h-[calc(100vh-64px)] bg-genie-hero px-4 py-12">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* Result header */}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-genie-gradient text-4xl shadow-lg">
              🧞
            </div>
            <div>
              <p className="text-genie-tan text-sm font-medium uppercase tracking-widest mb-1">Your Hair Type</p>
              <h1 className="font-display text-5xl font-bold text-gradient">{result.hairType}</h1>
            </div>
          </div>

          {/* Description */}
          <div className="bg-genie-brown border border-genie-mid rounded-2xl p-6">
            <p className="text-genie-cream leading-relaxed">{recs.description}</p>
          </div>

          {/* Tips */}
          <div className="bg-genie-brown border border-genie-mid rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-xl font-semibold text-genie-gold">
              Your Personalized Hair Tips
            </h2>
            <ul className="space-y-3">
              {recs.tips.map((tip, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-genie-gold/20 border border-genie-gold/40 flex items-center justify-center text-xs text-genie-gold font-bold">
                    {i + 1}
                  </span>
                  <p className="text-genie-cream text-sm leading-relaxed">{tip}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Recommended styles */}
          <div className="bg-genie-brown border border-genie-mid rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-xl font-semibold text-genie-gold">
              Recommended Styles for You
            </h2>
            <div className="flex flex-wrap gap-2">
              {recs.styles.map((style) => (
                <span
                  key={style}
                  className="px-3 py-1.5 rounded-full bg-genie-mid border border-genie-gold/20 text-genie-cream text-sm"
                >
                  {style}
                </span>
              ))}
            </div>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => navigate('/chat')}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-genie-gradient text-genie-dark font-semibold hover:opacity-90 transition-opacity"
            >
              <Sparkles className="w-4 h-4" />
              Ask Genie for More Advice
            </button>
            <button
              onClick={resetQuiz}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-genie-brown border border-genie-mid text-genie-cream hover:border-genie-gold/50 transition-colors font-medium"
            >
              Retake Quiz
            </button>
          </div>

          <p className="text-center text-xs text-genie-tan/40">
            Results are a guide — every head of hair is unique. Chat with Afro-Genie for deeper personalized advice.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-genie-hero px-4 py-12">
      <div className="max-w-xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="font-display text-3xl font-bold text-genie-cream">
            Discover Your Hair Type
          </h1>
          <p className="text-genie-tan text-sm">
            Answer {QUESTIONS.length} quick questions for personalized care advice
          </p>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-genie-tan/60">
            <span>Question {step + 1} of {QUESTIONS.length}</span>
            <span>{Math.round(progress)}% complete</span>
          </div>
          <div className="h-1.5 bg-genie-mid rounded-full overflow-hidden">
            <div
              className="h-full bg-genie-gradient rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Question card */}
        <div className="bg-genie-brown border border-genie-mid rounded-2xl p-6 space-y-6">
          <div className="space-y-1.5">
            <h2 className="font-display text-xl font-semibold text-genie-cream">
              {currentQuestion.question}
            </h2>
            <p className="text-genie-tan text-sm">{currentQuestion.description}</p>
          </div>

          <div className="space-y-2">
            {currentQuestion.options.map((option) => {
              const isSelected = answers[currentQuestion.id] === option.value
              return (
                <button
                  key={option.value}
                  onClick={() => handleAnswer(option.value)}
                  className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-genie-gold bg-genie-gold/10 text-genie-cream'
                      : 'border-genie-mid bg-genie-dark/30 text-genie-tan hover:border-genie-gold/40 hover:text-genie-cream'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'border-genie-gold' : 'border-genie-tan/40'
                      }`}
                    >
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full bg-genie-gold" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{option.label}</p>
                      <p className="text-xs opacity-70 mt-0.5">{option.desc}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          <button
            onClick={handleBack}
            disabled={step === 0}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-genie-brown border border-genie-mid text-genie-tan disabled:opacity-30 hover:text-genie-cream hover:border-genie-tan/50 transition-colors text-sm font-medium"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <button
            onClick={handleNext}
            disabled={!answers[currentQuestion.id]}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-genie-gradient text-genie-dark font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity text-sm"
          >
            {isLastStep ? (
              <>
                <Sparkles className="w-4 h-4" />
                Reveal My Hair Type
              </>
            ) : (
              <>
                Next
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
