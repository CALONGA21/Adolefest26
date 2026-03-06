import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';

const VALOR_INSCRICAO = 30;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function validarCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== parseInt(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== parseInt(digits[10])) return false;

  return true;
}

export default function InscricaoModal({ isOpen, onClose }: Props) {
  const [step, setStep] = useState<'form' | 'payment' | 'success'>('form');
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [errors, setErrors] = useState<{ nome?: string; cpf?: string }>({});
  const [loading, setLoading] = useState(false);
  const brickControllerRef = useRef<{ unmount: () => void } | null>(null);

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCpf(formatCpf(e.target.value));
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: { nome?: string; cpf?: string } = {};
    const trimmedName = nome.trim();

    if (!trimmedName || trimmedName.split(/\s+/).length < 2) {
      newErrors.nome = 'Informe nome e sobrenome';
    }
    if (!validarCpf(cpf)) {
      newErrors.cpf = 'CPF inválido';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setStep('payment');
  };

  // Initialize Payment Brick
  useEffect(() => {
    if (step !== 'payment') return;

    const initBrick = async () => {
      const publicKey = process.env.MERCADO_PAGO_PUBLIC_KEY;
      if (!publicKey || !window.MercadoPago) {
        console.error('Mercado Pago SDK ou public key não configurada');
        setLoading(false);
        return;
      }

      try {
        const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
        const bricksBuilder = mp.bricks();

        const nameParts = nome.trim().split(/\s+/);
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ');
        const cpfDigits = cpf.replace(/\D/g, '');

        brickControllerRef.current = await bricksBuilder.create('payment', 'paymentBrick_container', {
          initialization: {
            amount: VALOR_INSCRICAO,
            payer: {
              firstName,
              lastName,
              identification: {
                type: 'CPF',
                number: cpfDigits,
              },
            },
          },
          customization: {
            visual: {
              style: {
                theme: 'dark',
                customVariables: {
                  formBackgroundColor: '#1a1a1a',
                  baseColor: '#d97706',
                },
              },
            },
            paymentMethods: {
              creditCard: 'all',
              debitCard: 'all',
              ticket: 'all',
              bankTransfer: 'all',
              mercadoPago: 'all',
            },
          },
          callbacks: {
            onReady: () => setLoading(false),
            onSubmit: async ({ formData }: { formData: Record<string, unknown> }) => {
              const response = await fetch('/api/process_payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ...formData,
                  inscricao: { nome: nome.trim(), cpf: cpfDigits },
                }),
              });

              if (!response.ok) throw new Error('Falha no pagamento');
              setStep('success');
            },
            onError: (error: unknown) => {
              console.error('Payment Brick error:', error);
            },
          },
        });
      } catch (err) {
        console.error('Erro ao inicializar Payment Brick:', err);
        setLoading(false);
      }
    };

    setLoading(true);
    initBrick();

    return () => {
      brickControllerRef.current?.unmount();
      brickControllerRef.current = null;
    };
  }, [step, nome, cpf]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setStep('form');
        setNome('');
        setCpf('');
        setErrors({});
        setLoading(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const steps = ['form', 'payment', 'success'] as const;
  const currentIndex = steps.indexOf(step);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div className="flex items-center gap-3">
                {step === 'payment' && (
                  <button
                    onClick={() => {
                      brickControllerRef.current?.unmount();
                      brickControllerRef.current = null;
                      setStep('form');
                    }}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <ArrowLeft size={20} />
                  </button>
                )}
                <h2 className="text-xl font-bold uppercase tracking-wide">
                  {step === 'form' && 'Inscrição'}
                  {step === 'payment' && 'Pagamento'}
                  {step === 'success' && 'Confirmado!'}
                </h2>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Steps indicator */}
            <div className="px-6 pt-4 flex gap-2">
              {steps.map((s, i) => (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                    i <= currentIndex ? 'bg-amber-600' : 'bg-white/10'
                  }`}
                />
              ))}
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Step 1: Form */}
              {step === 'form' && (
                <form onSubmit={handleSubmitForm} className="space-y-5">
                  <p className="text-gray-400 text-sm mb-2">
                    Preencha seus dados para se inscrever no{' '}
                    <span className="text-white font-semibold">4º Encontrão</span>.
                  </p>

                  <div className="text-center py-3 px-4 bg-amber-600/10 rounded-xl border border-amber-600/20">
                    <p className="text-amber-500 text-sm font-medium">Valor da inscrição</p>
                    <p className="text-2xl font-bold text-white">
                      R$ {VALOR_INSCRICAO.toFixed(2).replace('.', ',')}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">
                      Nome completo
                    </label>
                    <input
                      type="text"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="João da Silva"
                      className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-amber-600/50 transition-colors"
                    />
                    {errors.nome && (
                      <p className="text-red-400 text-xs mt-1">{errors.nome}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">CPF</label>
                    <input
                      type="text"
                      value={cpf}
                      onChange={handleCpfChange}
                      placeholder="000.000.000-00"
                      inputMode="numeric"
                      maxLength={14}
                      className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-amber-600/50 transition-colors"
                    />
                    {errors.cpf && (
                      <p className="text-red-400 text-xs mt-1">{errors.cpf}</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl uppercase tracking-widest text-sm transition-colors"
                  >
                    Continuar para pagamento
                  </button>
                </form>
              )}

              {/* Step 2: Payment */}
              {step === 'payment' && (
                <div>
                  <p className="text-gray-400 text-sm mb-4">
                    Escolha a forma de pagamento para finalizar sua inscrição.
                  </p>
                  {loading && (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <Loader2 className="animate-spin text-amber-500" size={32} />
                      <p className="text-gray-500 text-sm">Carregando meios de pagamento...</p>
                    </div>
                  )}
                  <div id="paymentBrick_container" />
                </div>
              )}

              {/* Step 3: Success */}
              {step === 'success' && (
                <div className="text-center py-8">
                  <CheckCircle className="mx-auto text-green-500 mb-4" size={64} />
                  <h3 className="text-2xl font-bold mb-2">Inscrição Confirmada!</h3>
                  <p className="text-gray-400 mb-6">
                    Parabéns, <span className="text-white font-semibold">{nome.trim().split(/\s+/)[0]}</span>!
                    Sua inscrição no 4º Encontrão foi confirmada com sucesso.
                  </p>
                  <p className="text-gray-500 text-sm mb-8">
                    Nos vemos dia <strong className="text-white">16 de Maio de 2026</strong> às 19h!
                  </p>
                  <button
                    onClick={onClose}
                    className="px-8 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl uppercase tracking-widest text-sm transition-colors"
                  >
                    Fechar
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
