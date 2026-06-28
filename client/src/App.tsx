import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Chat from './pages/Chat'
import HairQuiz from './pages/HairQuiz'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-genie-dark text-genie-cream font-body">
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/quiz" element={<HairQuiz />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
