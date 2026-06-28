import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Sparkles, Menu, X } from 'lucide-react'

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/chat', label: 'Chat with Genie' },
  { to: '/quiz', label: 'Hair Quiz' },
]

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()

  return (
    <nav className="sticky top-0 z-50 bg-genie-dark/90 backdrop-blur-md border-b border-genie-mid">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-full bg-genie-gradient flex items-center justify-center text-sm animate-pulse-gold">
            🧞
          </div>
          <span className="font-display font-bold text-lg text-gradient">
            Afro-Genie
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === link.to
                  ? 'bg-genie-mid text-genie-gold'
                  : 'text-genie-tan hover:text-genie-cream hover:bg-genie-brown'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            to="/chat"
            className="ml-2 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-genie-gradient text-genie-dark text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Ask Genie
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          className="md:hidden p-2 text-genie-tan hover:text-genie-cream"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-genie-mid bg-genie-dark px-4 py-3 space-y-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMenuOpen(false)}
              className={`block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === link.to
                  ? 'bg-genie-mid text-genie-gold'
                  : 'text-genie-tan hover:text-genie-cream hover:bg-genie-brown'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  )
}
