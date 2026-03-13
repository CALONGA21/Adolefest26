import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';

const apiBaseUrl =
  (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '') ?? '';

type AlertState =
  | { type: 'success'; name: string; cpf: string }
  | { type: 'error'; message: string }
  | null;

type Tab = 'scanner' | 'manual';

type Attendee = {
  id: number;
  nome: string;
  cpf: string;
  checked_in: boolean;
};

function maskCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.***-**`;
}

export default function CheckinScanner() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [wrongPassword, setWrongPassword] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);
  const [scanning, setScanning] = useState(false);
  const [tab, setTab] = useState<Tab>('scanner');
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [attendeesError, setAttendeesError] = useState<string | null>(null);
  const [attendeesLoaded, setAttendeesLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [loadingCheckinId, setLoadingCheckinId] = useState<number | null>(null);
  const scannerDivId = 'html5qr-scanner';
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password === import.meta.env.VITE_CHECKIN_PASSWORD) {
      setAuthenticated(true);
      setWrongPassword(false);
    } else {
      setWrongPassword(true);
    }
  }

  useEffect(() => {
    if (!authenticated || tab !== 'scanner' || scanning) return;

    const scanner = new Html5QrcodeScanner(
      scannerDivId,
      {
        fps: 10,
        qrbox: { width: 300, height: 300 },
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
      },
      false,
    );

    scanner.render(
      async (decodedText) => {
        setScanning(true);
        setAlert(null);

        const orderId = parseInt(decodedText, 10);
        if (isNaN(orderId)) {
          setAlert({ type: 'error', message: 'QR Code invalido: nao contem um ID de pedido.' });
          setScanning(false);
          return;
        }

        try {
          const res = await fetch(`${apiBaseUrl}/api/checkin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId }),
          });
          const data = await res.json();

          if (res.ok && data.success) {
            setAlert({ type: 'success', name: data.participante.nome, cpf: data.participante.cpf });
            setAttendees((prev) =>
              prev.map((a) => (a.id === orderId ? { ...a, checked_in: true } : a)),
            );
          } else {
            setAlert({ type: 'error', message: data.error ?? 'Erro desconhecido.' });
          }
        } catch {
          setAlert({ type: 'error', message: 'Falha ao conectar com o servidor.' });
        }

        setTimeout(() => {
          setAlert(null);
          setScanning(false);
        }, 4000);
      },
      () => {},
    );

    scannerRef.current = scanner;

    return () => {
      scanner.clear().catch(() => {});
      scannerRef.current = null;
    };
  }, [authenticated, tab, scanning]);

  useEffect(() => {
    if (!authenticated || tab !== 'manual' || attendeesLoaded) return;

    setLoadingAttendees(true);
    setAttendeesError(null);

    fetch(`${apiBaseUrl}/api/attendees`)
      .then((res) => {
        if (!res.ok) throw new Error('Falha ao carregar lista');
        return res.json() as Promise<Attendee[]>;
      })
      .then((data) => {
        setAttendees(data);
        setAttendeesLoaded(true);
      })
      .catch(() => {
        setAttendeesError('Nao foi possivel carregar a lista de participantes.');
      })
      .finally(() => setLoadingAttendees(false));
  }, [authenticated, tab, attendeesLoaded]);

  const filteredAttendees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return attendees;
    const qDigits = q.replace(/\D/g, '');
    return attendees.filter((a) => {
      if (a.nome.toLowerCase().includes(q)) return true;
      if (qDigits && a.cpf.replace(/\D/g, '').includes(qDigits)) return true;
      return false;
    });
  }, [attendees, search]);

  async function handleManualCheckin(orderId: number) {
    if (loadingCheckinId !== null) return; // Prevent concurrent requests
    setLoadingCheckinId(orderId);
    setAlert(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setAttendees((prev) =>
          prev.map((a) => (a.id === orderId ? { ...a, checked_in: true } : a)),
        );
        setAlert({ type: 'success', name: data.participante.nome, cpf: data.participante.cpf });
      } else {
        setAlert({ type: 'error', message: data.error ?? 'Erro desconhecido.' });
      }
    } catch {
      setAlert({ type: 'error', message: 'Falha ao conectar com o servidor.' });
    } finally {
      setLoadingCheckinId(null);
    }

    setTimeout(() => setAlert(null), 4000);
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl p-8">
          <h1 className="text-white text-2xl font-bold text-center mb-2">Staff -- Check-in</h1>
          <p className="text-white/50 text-sm text-center mb-6">
            Digite a senha para acessar o leitor
          </p>
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {wrongPassword && (
              <p className="text-red-400 text-sm text-center">Senha incorreta. Tente novamente.</p>
            )}
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-amber-500 text-black font-bold uppercase tracking-widest hover:bg-amber-400 transition-colors"
            >
              Entrar
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex flex-col items-center px-4 pt-8 pb-16">
      <h1 className="text-white text-2xl font-bold mb-6">Check-in -- Staff</h1>

      <div className="flex w-full max-w-lg bg-white/5 rounded-xl p-1 mb-6 gap-1">
        {(['scanner', 'manual'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setAlert(null); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-colors ${
              tab === t ? 'bg-amber-500 text-black' : 'text-white/50 hover:text-white'
            }`}
          >
            {t === 'scanner' ? 'Leitor QR Code' : 'Busca Manual'}
          </button>
        ))}
      </div>

      {alert && (
        <div
          className={`w-full max-w-lg rounded-2xl p-8 mb-6 text-center shadow-2xl ${
            alert.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {alert.type === 'success' ? (
            <>
              <p className="text-6xl mb-3">&#x2705;</p>
              <p className="text-4xl font-extrabold leading-tight">{alert.name}</p>
              <p className="text-xl mt-2 opacity-90">CPF: {alert.cpf}</p>
            </>
          ) : (
            <>
              <p className="text-6xl mb-3">&#x274C;</p>
              <p className="text-3xl font-extrabold leading-tight">{alert.message}</p>
            </>
          )}
        </div>
      )}

      {tab === 'scanner' && (
        <div
          id={scannerDivId}
          className="w-full max-w-sm rounded-xl overflow-hidden"
          style={{ display: scanning ? 'none' : 'block' }}
        />
      )}

      {tab === 'manual' && (
        <div className="w-full max-w-lg flex flex-col gap-4">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Buscar por nome ou CPF..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              onClick={() => setAttendeesLoaded(false)}
              title="Recarregar lista"
              className="px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors text-lg"
            >
              &#x21BB;
            </button>
          </div>

          {loadingAttendees && (
            <p className="text-white/50 text-sm text-center py-8">Carregando participantes...</p>
          )}

          {attendeesError && (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-300 text-center">
              {attendeesError}
            </div>
          )}

          {!loadingAttendees && !attendeesError && filteredAttendees.length === 0 && (
            <p className="text-white/40 text-sm text-center py-8">
              {search ? 'Nenhum resultado encontrado.' : 'Nenhum participante com pagamento aprovado.'}
            </p>
          )}

          {filteredAttendees.map((attendee) => (
            <div
              key={attendee.id}
              className="flex items-center justify-between gap-4 bg-white/5 border border-white/10 rounded-xl px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-white font-semibold truncate">{attendee.nome}</p>
                <p className="text-white/40 text-sm">{maskCpf(attendee.cpf)}</p>
              </div>
              {attendee.checked_in ? (
                <span className="shrink-0 px-4 py-2 rounded-xl bg-white/10 text-white/40 text-sm font-bold cursor-default">
                  Ja Entrou
                </span>
              ) : (
                <button
                  onClick={() => handleManualCheckin(attendee.id)}
                  disabled={loadingCheckinId !== null}
                  className="shrink-0 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors"
                >
                  {loadingCheckinId === attendee.id ? 'Aguarde...' : 'Liberar Acesso'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
