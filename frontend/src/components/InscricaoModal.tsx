import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';

const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '') ?? '';
const apiUrl = (path: string): string => (apiBaseUrl ? `${apiBaseUrl}${path}` : path);

/* ---------- Componente isolado para o Payment Brick ---------- */
interface MercadoPagoSectionProps {
  preferenceId: string;
  amount: number;
  orderId: number;
  onReady: () => void;
  onError: (error: unknown) => void;
  onSuccess: () => void;
}

const MercadoPagoSection = React.memo(function MercadoPagoSection({
  preferenceId,
  amount,
  orderId,
  onReady,
  onError,
  onSuccess,
}: MercadoPagoSectionProps) {
  const containerId = useMemo(
    () => `mp-payment-brick-${preferenceId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
    [preferenceId],
  );

  const initialization = useMemo(
    () => ({ preferenceId, amount }),
    [preferenceId, amount],
  );

  const customization = useMemo(
    () => ({
      visual: {
        style: {
          theme: 'dark' as const,
          customVariables: {
            formBackgroundColor: '#1a1a1a',
            baseColor: '#d97706',
          },
        },
      },
      paymentMethods: {
        creditCard: 'all' as const,
        debitCard: 'all' as const,
        mercadoPago: 'all' as const,
      },
    }),
    [],
  );

  const handleSubmit = useCallback(
    async ({ formData }: { selectedPaymentMethod: string; formData: Record<string, unknown> }) => {
      const response = await fetch(apiUrl('/api/confirm_payment'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData, order_id: orderId }),
      });

      const data = (await response.json().catch(() => null)) as { status?: string; error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? 'Falha ao processar pagamento');
      }

      if (data?.status === 'rejected') {
        throw new Error('Pagamento recusado. Verifique os dados e tente novamente.');
      }

      // approved or pending (PIX/boleto) — advance to success screen
      onSuccess();
    },
    [orderId, onSuccess],
  );

  useEffect(() => {
    let cancelled = false;
    let controller: { unmount: () => void } | null = null;

    const mountBrick = async () => {
      try {
        const publicKey = import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY;
        if (!publicKey) {
          throw new Error('VITE_MERCADO_PAGO_PUBLIC_KEY ausente');
        }

        if (!window.MercadoPago) {
          console.info('[MP] SDK ainda nao disponivel, aguardando carregamento...');
          await waitForMercadoPagoSdk(7000);
        }

        if (!window.MercadoPago) {
          throw new Error('SDK Mercado Pago nao disponivel em window.MercadoPago');
        }

        const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
        const bricksBuilder = mp.bricks();

        const container = document.getElementById(containerId);
        if (!container) {
          throw new Error(`Container do Brick nao encontrado: ${containerId}`);
        }

        container.innerHTML = '';
        console.info('[MP] create(payment) start', { containerId, preferenceId });

        controller = await bricksBuilder.create('payment', containerId, {
          initialization,
          customization,
          callbacks: {
            onReady: () => {
              if (!cancelled) onReady();
            },
            onError: (error: unknown) => {
              if (!cancelled) onError(error);
            },
            onSubmit: handleSubmit,
          },
        });

        if (cancelled && controller) {
          controller.unmount();
        }
      } catch (error) {
        if (!cancelled) onError(error);
      }
    };

    mountBrick();

    return () => {
      cancelled = true;
      if (controller) {
        console.info('[MP] unmount(payment)', { containerId, preferenceId });
        controller.unmount();
      }
    };
  }, [containerId, customization, handleSubmit, initialization, onError, onReady, preferenceId]);

  return <div id={containerId} style={{ minHeight: '600px', width: '100%' }} />;
});
/* ------------------------------------------------------------ */

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim() !== '') return error;
  if (typeof error === 'object' && error !== null) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim() !== '') return maybeMessage;
  }
  return 'Erro desconhecido ao montar checkout.';
}

async function waitForMercadoPagoSdk(timeoutMs: number): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (typeof window !== 'undefined' && window.MercadoPago) {
      return;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }

  throw new Error('SDK do Mercado Pago nao ficou disponivel no navegador.');
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

function validarEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

type ProcessPaymentResponse = {
  preference_id?: string;
  amount?: number;
  order_id?: number;
  error?: string;
};

type PackageApiItem = {
  id: number;
  name: string;
  type: string;
  price: number | string;
};

type PackageOption = {
  id: number;
  name: string;
  type: string;
  price: number;
};

const normalizePackageType = (value: string): 'ingresso' | 'camiseta' | 'combo' | null => {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'ingresso') return 'ingresso';
  if (normalized === 'camiseta' || normalized === 'camisa') return 'camiseta';
  if (normalized === 'combo') return 'combo';
  return null;
};

const requiresShirtSize = (packageType: 'ingresso' | 'camiseta' | 'combo'): boolean =>
  packageType === 'combo' || packageType === 'camiseta';

const shirtSizes = ['PP', 'P', 'M', 'G', 'GG', 'XG'] as const;

type FormErrors = {
  nome?: string;
  cpf?: string;
  email?: string;
  tamanhoCamisa?: string;
};

const formatCurrency = (value: number): string =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function InscricaoModal({ isOpen, onClose }: Props) {
  const [step, setStep] = useState<'consent' | 'form' | 'payment' | 'success'>('consent');
  const [consentChecked, setConsentChecked] = useState(false);
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [shirtSize, setShirtSize] = useState('');
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<PackageOption | null>(null);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);
  const [packagesError, setPackagesError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [preferenceId, setPreferenceId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [isCreatingPreference, setIsCreatingPreference] = useState(false);
  const [loading, setLoading] = useState(false);
  const [brickReady, setBrickReady] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const publicKey = import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY;
  const normalizedSelectedPackageType = selectedPackage ? normalizePackageType(selectedPackage.type) : null;
  const packageRequiresShirtSize = normalizedSelectedPackageType
    ? requiresShirtSize(normalizedSelectedPackageType)
    : false;

  const handleBrickReady = useCallback(() => {
    console.info('[MP] Brick ready');
    setBrickReady(true);
    setLoading(false);
  }, []);
  const handleBrickError = useCallback((error: unknown) => {
    const reason = getErrorMessage(error);
    console.error('[MP] Erro interno do Brick:', error);
    setBrickReady(false);
    setPaymentError(`Erro no checkout: ${reason}`);
    setLoading(false);
  }, []);
  const handlePaymentSuccess = useCallback(() => {
    setStep('success');
  }, []);

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCpf(formatCpf(e.target.value));
  };

  useEffect(() => {
    let isMounted = true;

    const fetchPackages = async () => {
      try {
        setIsLoadingPackages(true);
        setPackagesError(null);

        const response = await fetch(apiUrl('/api/packages'));
        const rawData = (await response.json().catch(() => null)) as PackageApiItem[] | null;

        if (!response.ok || !Array.isArray(rawData)) {
          throw new Error('Nao foi possivel carregar os pacotes.');
        }

        const normalizedPackages = rawData
          .map((item) => ({
            id: item.id,
            name: item.name,
            type: item.type,
            price: Number(item.price),
          }))
          .filter((item) => Number.isFinite(item.price) && item.price > 0);

        if (!isMounted) return;

        setPackages(normalizedPackages);
        setSelectedPackage((current) => {
          if (current) {
            const currentType = normalizePackageType(current.type);
            const updatedSelection = normalizedPackages.find(
              (item) => normalizePackageType(item.type) === currentType,
            );
            if (updatedSelection) return updatedSelection;
          }

          return normalizedPackages[0] ?? null;
        });

        if (normalizedPackages.length === 0) {
          setPackagesError('Nenhum pacote disponivel no momento.');
        }
      } catch (error) {
        if (!isMounted) return;
        console.error('Erro ao buscar pacotes:', error);
        setPackages([]);
        setSelectedPackage(null);
        setPackagesError('Nao foi possivel carregar os pacotes. Tente novamente em instantes.');
      } finally {
        if (isMounted) {
          setIsLoadingPackages(false);
        }
      }
    };

    fetchPackages();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: FormErrors = {};
    const trimmedName = nome.trim();
    const trimmedEmail = email.trim();
    const cpfDigits = cpf.replace(/\D/g, '');

    if (!trimmedName || trimmedName.split(/\s+/).length < 2) {
      newErrors.nome = 'Informe nome e sobrenome';
    }
    if (!validarCpf(cpf)) {
      newErrors.cpf = 'CPF inválido';
    }
    if (!validarEmail(trimmedEmail)) {
      newErrors.email = 'Email inválido';
    }
    if (!selectedPackage) {
      setPaymentError('Selecione um pacote valido para continuar.');
      return;
    }
    if (!normalizedSelectedPackageType) {
      setPaymentError('Tipo de pacote invalido. Ajuste os tipos no banco para ingresso, camiseta/camisa ou combo.');
      return;
    }
    if (packageRequiresShirtSize && !shirtSizes.includes(shirtSize as (typeof shirtSizes)[number])) {
      newErrors.tamanhoCamisa = 'Selecione o tamanho da camisa';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setErrors({});
      setPaymentError(null);
      setIsCreatingPreference(true);

      const response = await fetch(apiUrl('/api/process_payment'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: trimmedName,
          cpf: cpfDigits,
          email: trimmedEmail,
          pacote: normalizedSelectedPackageType,
          tamanho_camisa: packageRequiresShirtSize ? shirtSize : undefined,
        }),
      });

      const data = (await response.json().catch(() => null)) as ProcessPaymentResponse | null;

      if (!response.ok) {
        if (response.status === 400) {
          setPaymentError(data?.error || 'Ingressos esgotados.');
          return;
        }

        setPaymentError(data?.error || 'Nao foi possivel iniciar o pagamento.');
        return;
      }

      if (!data?.preference_id) {
        setPaymentError('Checkout indisponivel no momento. Tente novamente.');
        return;
      }

      console.info('[MP] preference_id recebido:', data.preference_id, 'amount:', data.amount);
      setPreferenceId(data.preference_id);
      setOrderId(data.order_id ?? null);
      setAmount(data.amount ?? 0);
      setBrickReady(false);
      setLoading(true);
      setStep('payment');
    } catch (error) {
      console.error('Erro ao criar preferencia de pagamento:', error);
      setPaymentError('Falha de conexao ao iniciar pagamento.');
    } finally {
      setIsCreatingPreference(false);
    }
  };

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setStep('consent');
      setConsentChecked(false);
      setNome('');
      setCpf('');
      setEmail('');
      setShirtSize('');
      setSelectedPackage(packages[0] ?? null);
      setErrors({});
      setPaymentError(null);
      setIsCreatingPreference(false);
      setBrickReady(false);
      setLoading(false);
      setPreferenceId(null);
      setOrderId(null);
    }
  }, [isOpen, packages]);

  useEffect(() => {
    if (step !== 'payment') return;

    if (!publicKey) {
      setPaymentError('Chave publica do Mercado Pago ausente no frontend.');
      setLoading(false);
      setBrickReady(false);
      return;
    }

    console.info('[MP] Tentando montar Brick', {
      hasPublicKey: Boolean(publicKey),
      preferenceId,
    });
  }, [step, preferenceId, publicKey]);

  useEffect(() => {
    if (step !== 'payment' || !loading) return;
    const timeout = window.setTimeout(() => {
      setLoading(false);
      setPaymentError('Checkout demorou para carregar. Tente voltar e abrir novamente.');
    }, 12000);

    return () => window.clearTimeout(timeout);
  }, [step, loading]);

  const steps = ['consent', 'form', 'payment', 'success'] as const;
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
                      setPreferenceId(null);
                      setStep('form');
                    }}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <ArrowLeft size={20} />
                  </button>
                )}
                <h2 className="text-xl font-bold uppercase tracking-wide">
                  {step === 'consent' && 'Termos e Privacidade'}
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
              {/* Step 0: Consent */}
              {step === 'consent' && (
                <div className="space-y-5">
                  <p className="text-gray-300 text-sm leading-relaxed">
                    Antes de preencher seus dados, leia e aceite os termos abaixo para continuar a
                    inscricao no evento.
                  </p>

                  <div className="rounded-xl border border-amber-600/25 bg-amber-600/10 p-4 text-sm text-gray-200 space-y-3">
                    <p>
                      Os dados (Nome, CPF e E-mail) sao coletados exclusivamente para a emissao do
                      voucher nominal e identificacao no evento Adolefest 2026.
                    </p>
                    <p>
                      O CPF e obrigatorio para evitar fraudes e garantir que o ingresso seja unico e
                      intransferivel.
                    </p>
                    <p>
                      O usuario autoriza o tratamento desses dados conforme a LGPD apenas para fins
                      de gestao deste evento pelo Agiliza Inscricoes.
                    </p>
                  </div>

                  <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-[#121212] p-4 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consentChecked}
                      onChange={(e) => setConsentChecked(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-amber-600"
                    />
                    <span className="text-sm text-gray-200">
                      Li e concordo com os Termos de Uso e Politica de Privacidade
                    </span>
                  </label>

                  <button
                    type="button"
                    disabled={!consentChecked}
                    onClick={() => setStep('form')}
                    className="w-full py-3.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl uppercase tracking-widest text-sm transition-colors"
                  >
                    Prosseguir com inscricao
                  </button>
                </div>
              )}

              {/* Step 1: Form */}
              {step === 'form' && (
                <form onSubmit={handleSubmitForm} className="space-y-5">
                  <p className="text-gray-400 text-sm mb-2">
                    Preencha seus dados para se inscrever no{' '}
                    <span className="text-white font-semibold">4º Encontrão</span>.
                  </p>

                  <div className="space-y-3 rounded-xl border border-white/10 bg-[#121212] p-4">
                    <label htmlFor="pacote" className="block text-sm font-medium text-gray-200">
                      Escolha seu pacote
                    </label>
                    <select
                      id="pacote"
                      value={selectedPackage?.type ?? ''}
                      onChange={(e) => {
                        const nextPackage = packages.find((item) => item.type === e.target.value) ?? null;
                        setSelectedPackage(nextPackage);
                        const normalizedNextType = normalizePackageType(nextPackage?.type ?? '');
                        if (!normalizedNextType || !requiresShirtSize(normalizedNextType)) {
                          setShirtSize('');
                          setErrors((current) => ({ ...current, tamanhoCamisa: undefined }));
                        }
                      }}
                      disabled={isLoadingPackages || packages.length === 0}
                      className="w-full bg-[#0f0f0f] border border-white/15 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-600/50 transition-colors"
                    >
                      {isLoadingPackages && <option value="">Carregando pacotes...</option>}
                      {!isLoadingPackages && packages.length === 0 && (
                        <option value="">Nenhum pacote disponivel</option>
                      )}
                      {packages.map((item) => (
                        <option key={item.id} value={item.type}>
                          {item.name}
                        </option>
                      ))}
                    </select>

                    <div className="rounded-xl border border-amber-600/25 bg-amber-600/10 px-4 py-3">
                      <p className="text-amber-400 text-xs font-semibold uppercase tracking-wider">Valor Total</p>
                      <p className="text-2xl font-bold text-white">
                        {formatCurrency(selectedPackage?.price ?? 0)}
                      </p>
                      {selectedPackage && (
                        <p className="text-xs text-gray-300 mt-1">{selectedPackage.name}</p>
                      )}
                      {packagesError && <p className="text-xs text-red-300 mt-1">{packagesError}</p>}
                    </div>

                    {packageRequiresShirtSize && (
                      <div>
                        <label htmlFor="shirtSize" className="block text-sm font-medium text-gray-200 mb-1.5">
                          Tamanho da camisa
                        </label>
                        <select
                          id="shirtSize"
                          value={shirtSize}
                          onChange={(e) => {
                            setShirtSize(e.target.value);
                            setErrors((current) => ({ ...current, tamanhoCamisa: undefined }));
                          }}
                          className="w-full bg-[#0f0f0f] border border-white/15 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-600/50 transition-colors"
                        >
                          <option value="">Selecione o tamanho</option>
                          {shirtSizes.map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                          ))}
                        </select>
                        {errors.tamanhoCamisa && (
                          <p className="text-red-400 text-xs mt-1">{errors.tamanhoCamisa}</p>
                        )}
                      </div>
                    )}
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

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="voce@email.com"
                      className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-amber-600/50 transition-colors"
                    />
                    {errors.email && (
                      <p className="text-red-400 text-xs mt-1">{errors.email}</p>
                    )}
                  </div>

                  {paymentError && (
                    <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-300">
                      {paymentError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isCreatingPreference}
                    className="w-full py-3.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl uppercase tracking-widest text-sm transition-colors"
                  >
                    {isCreatingPreference ? 'Iniciando checkout...' : 'Continuar para pagamento'}
                  </button>
                </form>
              )}

              {/* Step 2: Payment */}
              {step === 'payment' && (
                <div>
                  <p className="text-gray-400 text-sm mb-4">
                    Escolha a forma de pagamento para finalizar sua inscrição.
                  </p>
                  {paymentError && (
                    <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-300">
                      {paymentError}
                    </div>
                  )}
                  {loading && (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <Loader2 className="animate-spin text-amber-500" size={32} />
                      <p className="text-gray-500 text-sm">Carregando meios de pagamento...</p>
                    </div>
                  )}
                  {!loading && !brickReady && !paymentError && (
                    <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                      Inicializando checkout do Mercado Pago...
                    </div>
                  )}
                  {/* Brick isolado em React.memo — só re-renderiza se preferenceId mudar */}
                  {typeof preferenceId === 'string' && preferenceId.trim() !== '' && typeof orderId === 'number' && (
                    <MercadoPagoSection
                      key={preferenceId}
                      preferenceId={preferenceId}
                      amount={amount}
                      orderId={orderId}
                      onReady={handleBrickReady}
                      onError={handleBrickError}
                      onSuccess={handlePaymentSuccess}
                    />
                  )}
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
