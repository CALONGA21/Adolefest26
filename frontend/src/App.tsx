import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Calendar, MapPin, Clock } from 'lucide-react';
import InscricaoModal from './components/InscricaoModal';

export default function App() {
  const [modalOpen, setModalOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  // Event date: May 16, 2026, 19:00
  const eventDate = new Date('2026-05-16T19:00:00').getTime();

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const distance = eventDate - now;

      if (distance < 0) {
        clearInterval(timer);
        return;
      }

      setTimeLeft({
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000),
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [eventDate]);

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white font-sans selection:bg-amber-500 selection:text-black">
      {/* Header */}
      <header className="fixed top-0 left-0 w-full z-50 px-6 py-4 flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center p-1">
            <img 
              src="https://picsum.photos/seed/church-logo/100/100" 
              alt="Logo" 
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
        <nav className="hidden md:flex gap-8 text-sm font-medium uppercase tracking-widest">
          <a href="#" className="hover:text-amber-500 transition-colors">Início</a>
          <a href="#sobre" className="hover:text-amber-500 transition-colors">Sobre</a>
          <a href="#programacao" className="hover:text-amber-500 transition-colors">Programação</a>
        </nav>
        <button
          onClick={() => setModalOpen(true)}
          className="px-6 py-2 border border-white/30 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-white hover:text-black transition-all duration-300"
        >
          Inscrições
        </button>
      </header>

      {/* Hero Section */}
      <section className="relative h-screen flex flex-col items-center justify-center overflow-hidden">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0">
          <img 
            src="/images/bg-adolefest-2026.jpg" 
            alt="Background" 
            className="w-full h-full object-cover grayscale-[0.2] brightness-[0.4]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-transparent to-black/40"></div>
        </div>

        {/* Large Background Text */}
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none select-none">
          <motion.h2 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 0.15, scale: 1 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className="text-[15vw] md:text-[20vw] font-black text-amber-600 leading-none text-center uppercase whitespace-nowrap"
          >
            ELE ME VIU <br /> PRIMEIRO
          </motion.h2>
        </div>

        {/* Main Content */}
        <div className="relative z-20 flex flex-col items-center text-center px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-4xl md:text-7xl font-bold uppercase tracking-tight mb-2">
              4º ENCONTRÃO
            </h1>
            <div className="w-16 h-1 bg-amber-600 mx-auto mb-6"></div>
            
            <p className="text-lg md:text-xl font-light tracking-wide mb-8 text-gray-300">
              Dia <span className="font-bold text-white">16 de Maio</span> de 2026 às 19h
            </p>

            <button
              onClick={() => setModalOpen(true)}
              className="px-10 py-4 bg-white text-black font-bold rounded-full uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all duration-300 shadow-2xl shadow-black/50"
            >
              Inscreva-se
            </button>
          </motion.div>
        </div>

        {/* Countdown Bar */}
        <div className="absolute bottom-0 left-0 w-full bg-black/80 backdrop-blur-md border-t border-white/10 py-6 z-30">
          <div className="max-w-4xl mx-auto flex justify-center gap-8 md:gap-16">
            <div className="flex flex-col items-center">
              <span className="text-3xl md:text-5xl font-bold text-white">{timeLeft.days}</span>
              <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Dias</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-3xl md:text-5xl font-bold text-white">{timeLeft.hours}</span>
              <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Horas</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-3xl md:text-5xl font-bold text-white">{timeLeft.minutes}</span>
              <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Min</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-3xl md:text-5xl font-bold text-white">{timeLeft.seconds}</span>
              <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Seg</span>
            </div>
          </div>
        </div>
      </section>

      {/* Inscrições Section */}
      <section className="py-24 px-6 bg-[#121212]">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col items-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold uppercase tracking-tight mb-4">Inscrições</h2>
            <div className="w-12 h-1 bg-amber-600"></div>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-[#1a1a1a] p-8 rounded-2xl border border-white/5 hover:border-amber-600/30 transition-all group">
              <div className="w-12 h-12 bg-amber-600/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-amber-600/20 transition-colors">
                <Calendar className="text-amber-500" />
              </div>
              <h3 className="text-xl font-bold mb-2 uppercase tracking-wide">Data do Evento</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                16 de Maio de 2026. Um momento único de fé e renovação.
              </p>
            </div>

            <div className="bg-[#1a1a1a] p-8 rounded-2xl border border-white/5 hover:border-amber-600/30 transition-all group">
              <div className="w-12 h-12 bg-amber-600/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-amber-600/20 transition-colors">
                <MapPin className="text-amber-500" />
              </div>
              <h3 className="text-xl font-bold mb-2 uppercase tracking-wide">Localização</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                R. Batuquira, 100 - Vila Bernardes, Arapongas - PR, 86705-030.
              </p>
            </div>

            <div className="bg-[#1a1a1a] p-8 rounded-2xl border border-white/5 hover:border-amber-600/30 transition-all group">
              <div className="w-12 h-12 bg-amber-600/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-amber-600/20 transition-colors">
                <Clock className="text-amber-500" />
              </div>
              <h3 className="text-xl font-bold mb-2 uppercase tracking-wide">Horários</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Sábado: 19:00 às 22:00
              </p>
            </div>
          </div>

          <div className="mt-20 p-12 bg-gradient-to-br from-amber-600 to-amber-800 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="text-center md:text-left">
              <h3 className="text-3xl font-black uppercase tracking-tight mb-2">Fique por dentro</h3>
              <p className="text-white/80">Receba todas as atualizações do evento diretamente no seu e-mail.</p>
            </div>
            <div className="flex w-full md:w-auto gap-2">
              <input 
                type="email" 
                placeholder="Seu melhor e-mail" 
                className="bg-white/10 border border-white/20 rounded-full px-6 py-3 flex-1 md:w-80 focus:outline-none focus:bg-white/20 transition-all placeholder:text-white/50"
              />
              <button className="bg-white text-amber-700 font-bold px-8 py-3 rounded-full hover:bg-black hover:text-white transition-all">
                Enviar
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/5 text-center text-gray-500 text-xs uppercase tracking-[0.2em]">
        <p className="mb-3">
          SAC:{' '}
          <a
            href="mailto:adolfo@agilizaaivai.com"
            className="text-amber-400 hover:text-amber-300 transition-colors"
          >
            adolfo@agilizaaivai.com
          </a>
        </p>
        <p>&copy; 2026 4º Encontrão. Todos os direitos reservados.</p>
      </footer>

      {/* Modal de Inscrição + Pagamento */}
      <InscricaoModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
