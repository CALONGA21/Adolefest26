<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 4º Encontrão - Ele Me Viu Primeiro

Landing page oficial de inscrições para o evento **4º Encontrão**.

O projeto oferece uma experiência completa para o participante:
- apresentação visual do evento;
- contagem regressiva em tempo real;
- formulário de inscrição com validação de dados;
- checkout com **Mercado Pago Payment Brick**;
- processamento do pagamento via backend Express.

## O que o site faz

O site foi construído para centralizar a divulgação e a inscrição do evento.

Fluxo principal do usuário:
1. Acessa a landing page e vê data, local e informações gerais.
2. Clica em **Inscreva-se**.
3. Preenche nome completo e CPF (com validação).
4. Escolhe a forma de pagamento no checkout do Mercado Pago.
5. Após sucesso, recebe confirmação da inscrição na interface.

## Funcionalidades

- Hero com identidade visual do evento.
- Contador regressivo para `16/05/2026 19:00`.
- Modal multi-etapas (`form -> payment -> success`).
- Validação de CPF e nome completo no frontend.
- Integração com SDK Web do Mercado Pago (`Payment Brick`).
- Endpoint backend para criação de pagamento com chave de idempotência.
- Proxy de `/api` no Vite para o backend local.

## Stack e ferramentas

### Frontend
- React 19 + TypeScript
- Vite 6
- Tailwind CSS 4
- Motion (animações)
- Lucide React (ícones)

### Backend
- Node.js + Express
- SDK Mercado Pago (`mercadopago`)
- `dotenv` para variáveis de ambiente

### Desenvolvimento
- `tsx` para rodar `server.ts` em modo watch
- `tsc --noEmit` para checagem de tipos (`npm run lint`)

## Estrutura do projeto

```txt
.
|- server.ts                    # API de pagamentos (Express)
|- index.html                   # HTML base + script SDK Mercado Pago
|- vite.config.ts               # Config Vite + proxy /api
|- src/
|  |- App.tsx                   # Landing page principal
|  |- components/
|  |  |- InscricaoModal.tsx     # Formulario + checkout + confirmacao
|  |- types/
|  |  |- mercadopago.d.ts       # Tipagens globais do SDK web
```

## Variaveis de ambiente

Crie um arquivo `.env.local` na raiz com:

```env
# Backend (obrigatorio para processar pagamento)
MERCADO_PAGO_ACCESS_TOKEN=seu_access_token

# Frontend (obrigatorio para carregar checkout)
VITE_MERCADO_PAGO_PUBLIC_KEY=sua_public_key

# Opcional: porta da API Express
API_PORT=3001

# Opcional: legado de template AI Studio
GEMINI_API_KEY=
```

Notas:
- O frontend usa `VITE_MERCADO_PAGO_PUBLIC_KEY`.
- O backend usa `MERCADO_PAGO_ACCESS_TOKEN`.
- Sem Public Key/SDK, o modal exibe erro de configuracao em vez de falhar silenciosamente.

## Como rodar localmente

Pre-requisito: Node.js instalado.

1. Instale as dependencias:
   ```bash
   npm install
   ```
2. Inicie o backend de pagamentos:
   ```bash
   npm run dev:server
   ```
3. Em outro terminal, inicie o frontend:
   ```bash
   npm run dev
   ```
4. Acesse:
   - Frontend: `http://localhost:3000`
   - API: `http://localhost:3001`

## Scripts disponiveis

- `npm run dev`: sobe frontend Vite na porta 3000.
- `npm run dev:server`: sobe API Express em watch.
- `npm run build`: gera build de producao.
- `npm run preview`: serve build local.
- `npm run lint`: checagem de tipos TypeScript.

## Endpoint de pagamento

- `POST /api/process_payment`

Comportamento:
- recebe os dados do checkout e dados da inscricao;
- cria o pagamento no Mercado Pago;
- retorna status e id do pagamento;
- usa `idempotencyKey` para reduzir risco de cobranca duplicada.

## Observacoes

- O script do SDK Mercado Pago e carregado em `index.html`.
- O proxy em `vite.config.ts` redireciona `/api` para `http://localhost:3001` durante desenvolvimento.
- A interface foi desenhada com foco mobile e desktop.
