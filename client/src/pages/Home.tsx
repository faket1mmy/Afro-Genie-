import { Link } from 'react-router-dom'
import { Sparkles, MessageCircle, Brain, Crown, Star, Zap, Shield } from 'lucide-react'

const FEATURES = [
  {
    icon: Brain,
    title: 'Deep Hair Science',
    description:
      'Understand porosity, density, curl patterns, and the science behind moisture retention in African and natural hair.',
  },
  {
    icon: Crown,
    title: 'Cultural Wisdom',
    description:
      'Rooted in African hair traditions — from the cornrows of the Fula to the royal locs of the Himba, your style carries history.',
  },
  {
    icon: Shield,
    title: 'Protective Styling',
    description:
      'Learn box braids, Bantu knots, twists, and more — styles designed to protect your crown while looking stunning.',
  },
  {
    icon: Zap,
    title: 'Instant Answers',
    description:
      'No more scrolling through endless forums. Get personalized answers tailored to your hair type in seconds.',
  },
  {
    icon: Star,
    title: 'Product Guidance',
    description:
      'Know what ingredients to seek and avoid. Build a routine that works with your natural texture, not against it.',
  },
  {
    icon: MessageCircle,
    title: 'Ongoing Support',
    description:
      'Your hair journey is ongoing. Come back any time — whether you\'re transitioning, loc\'ing, or just experimenting.',
  },
]

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Tell the Genie',
    desc: 'Describe your hair — its texture, concerns, and goals. Take our quiz or just start chatting.',
  },
  {
    step: '02',
    title: 'Receive Wisdom',
    desc: 'Afro-Genie draws from deep knowledge of African hair science and centuries of natural hair traditions.',
  },
  {
    step: '03',
    title: 'Rock Your Crown',
    desc: 'Walk away with a personalized routine, style ideas, and the confidence to embrace your natural hair.',
  },
]

const HAIR_TYPES = ['4C', '4B', '4A', '3C', '3B', '3A', '2C', '2B', 'Locs', 'Transitioning']

export default function Home() {
  return (
    <div className="min-h-screen bg-genie-dark">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-genie-hero" />
        <div className="absolute inset-0 pattern-dots" />

        {/* Decorative orbs */}
        <div className="absolute top-20 left-10 w-64 h-64 rounded-full bg-genie-gold/5 blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-genie-orange/5 blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-4 pt-20 pb-24 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-genie-gold/10 border border-genie-gold/20 text-genie-gold text-xs font-medium mb-8">
            <Sparkles className="w-3.5 h-3.5" />
            AI-Powered Natural Hair Wisdom
          </div>

          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold leading-tight mb-6">
            <span className="text-genie-cream">Unlock the Magic of</span>
            <br />
            <span className="text-gradient">Your Natural Hair</span>
          </h1>

          <p className="text-genie-tan text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed mb-10">
            Afro-Genie combines ancient African hair wisdom with modern AI to give you
            personalized advice for every curl, coil, and kink — your crown deserves the best.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link
              to="/chat"
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-genie-gradient text-genie-dark font-bold text-lg hover:opacity-90 transition-opacity shadow-lg"
            >
              <span>🧞</span>
              Chat with Afro-Genie
            </Link>
            <Link
              to="/quiz"
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-genie-brown border border-genie-gold/30 text-genie-cream font-semibold text-lg hover:border-genie-gold/60 transition-colors"
            >
              <Sparkles className="w-5 h-5 text-genie-gold" />
              Discover Your Hair Type
            </Link>
          </div>

          {/* Hair type chips */}
          <div className="flex flex-wrap justify-center gap-2">
            <span className="text-xs text-genie-tan/60 self-center">Supporting:</span>
            {HAIR_TYPES.map((type) => (
              <span
                key={type}
                className="px-3 py-1 rounded-full bg-genie-mid border border-genie-gold/10 text-genie-tan text-xs"
              >
                {type}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Genie intro card */}
      <section className="max-w-6xl mx-auto px-4 -mt-8 mb-24">
        <div className="relative rounded-2xl overflow-hidden border border-genie-gold/20 bg-gradient-to-br from-genie-brown to-genie-dark p-8 md:p-12">
          <div className="absolute top-0 right-0 w-48 h-48 bg-genie-gold/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-full bg-genie-gradient flex items-center justify-center text-2xl shadow-lg animate-float">
                  🧞
                </div>
                <div>
                  <p className="text-genie-tan text-xs uppercase tracking-wider">Meet</p>
                  <h2 className="font-display text-2xl font-bold text-genie-cream">Afro-Genie</h2>
                </div>
              </div>
              <blockquote className="text-genie-cream text-lg leading-relaxed italic font-display">
                "I carry the wisdom of generations — from the braiding circles of West Africa
                to the natural hair movement of today. Ask me anything about your crown."
              </blockquote>
            </div>
            <div className="space-y-3">
              {[
                '✓ Trained on African and natural hair science',
                '✓ Knows 4A, 4B, 4C, 3C, 3B, 3A textures and more',
                '✓ Understands the cultural weight of your hairstyles',
                '✓ Gives practical, actionable advice — not generic tips',
                '✓ Always encouraging, never judgmental',
              ].map((point) => (
                <p key={point} className="text-genie-cream text-sm flex items-start gap-2">
                  <span className="text-genie-gold">{point.slice(0, 1)}</span>
                  {point.slice(1)}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="max-w-6xl mx-auto px-4 mb-24">
        <div className="text-center mb-12">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-genie-cream mb-3">
            Everything Your Hair Needs
          </h2>
          <p className="text-genie-tan max-w-xl mx-auto">
            From understanding your curl pattern to building a full routine, Afro-Genie has you covered.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className="p-6 rounded-2xl bg-genie-brown border border-genie-mid hover:border-genie-gold/30 transition-colors group"
              >
                <div className="w-10 h-10 rounded-xl bg-genie-gold/10 border border-genie-gold/20 flex items-center justify-center mb-4 group-hover:bg-genie-gold/20 transition-colors">
                  <Icon className="w-5 h-5 text-genie-gold" />
                </div>
                <h3 className="font-semibold text-genie-cream mb-2">{feature.title}</h3>
                <p className="text-genie-tan text-sm leading-relaxed">{feature.description}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-genie-brown border-y border-genie-mid py-24 mb-24">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-genie-cream mb-3">
              How It Works
            </h2>
            <p className="text-genie-tan">Three simple steps to unlock your hair's potential</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map((item, i) => (
              <div key={item.step} className="text-center relative">
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-[calc(50%+40px)] right-0 h-px bg-genie-gold/20" />
                )}
                <div className="inline-flex w-16 h-16 rounded-full bg-genie-dark border border-genie-gold/30 items-center justify-center mb-4 relative z-10">
                  <span className="font-display text-2xl font-bold text-gradient">{item.step}</span>
                </div>
                <h3 className="font-display text-xl font-semibold text-genie-cream mb-2">{item.title}</h3>
                <p className="text-genie-tan text-sm leading-relaxed max-w-xs mx-auto">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 pb-24">
        <div className="rounded-3xl bg-genie-gradient p-1">
          <div className="rounded-[calc(1.5rem-1px)] bg-gradient-to-br from-genie-brown to-genie-dark px-8 py-16 text-center">
            <div className="text-5xl mb-4 animate-float">🧞</div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-genie-cream mb-4">
              Your Crown is Calling
            </h2>
            <p className="text-genie-tan max-w-md mx-auto mb-8 leading-relaxed">
              The Genie is ready. Whether you have a quick question or need a full hair care
              overhaul — wisdom is one message away.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/chat"
                className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-genie-gradient text-genie-dark font-bold hover:opacity-90 transition-opacity"
              >
                <Sparkles className="w-5 h-5" />
                Summon the Genie
              </Link>
              <Link
                to="/quiz"
                className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-genie-gold/40 text-genie-cream font-semibold hover:border-genie-gold transition-colors"
              >
                Take the Hair Quiz
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-genie-mid py-8 text-center">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="text-lg">🧞</span>
            <span className="font-display font-bold text-gradient">Afro-Genie</span>
          </div>
          <p className="text-genie-tan/50 text-xs">
            Celebrating the beauty, power, and culture of natural African hair.
          </p>
        </div>
      </footer>
    </div>
  )
}
