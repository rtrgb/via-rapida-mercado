# Via Rápida Mercado

Sistema Web do projeto de extensão de Programação Web (Univali, 2026). Autor: Gabriel. Orientador: Prof. Dr. Jhonatan Alves.
Parceira: Via Rápida Mercado (Rua 1400, 429, Balneário Camboriú), dona Sra. Alaides de Quadros Ribeiro.

## Prazos
- Apresentação do sistema para a dona: semana de 23 a 27/11/2026.
- Entrega final da M3: 02/12/2026.

## Stack
- HTML, CSS e JS puros, sem framework e sem build. GitHub Pages (branch main, raiz).
- Supabase: PostgreSQL + Auth + RLS + Realtime + Edge Function `avisar` (e-mail via Brevo).
- supabase-js 2.45.4 via CDN (UMD, global `supabase`). Cliente compartilhado em `js/db.js` (`VR.db`, `VR.msg`).
- Páginas da loja usam `VR_AUTH.exigirLogin()` e `VR_AUTH.toast()` de `js/auth.js`.

## Regras do projeto
- O nome é sempre "Via Rápida Mercado". Nunca "mercadinho".
- Cores azul e branco (`--blue: #1D4ED8`), tema claro, visual limpo, botões discretos, textos curtos e diretos.
- Nunca citar outra disciplina (Engenharia de Software) em código, README ou documentos.
- Segurança: a chave anon pode ficar em `js/config.js`. A `service_role` e a chave do Brevo NUNCA vão para o código; ficam só nos Secrets das Edge Functions.
- Visitante (anon) só acessa as funções `disponibilidade`, `criar_reserva`, `inscrever`, `cancelar_inscricao`, `minhas_reservas`, `alterar_reserva` e `cancelar_reserva`. Todo o resto exige login.
- `supabase/schema.sql` precisa continuar podendo rodar várias vezes num banco que já existe (use `if not exists`, `create or replace`, `drop ... if exists`).
- Regras de negócio ficam no banco (gatilhos e funções), não só no front-end.
- Comentários curtos; cite RF/RN do documento de requisitos quando ajudar.
- Mantenha o checklist "Andamento" do README atualizado.

## Requisitos (resumo)
- RN02 balcão = fornada atual - vendas - reservas aguardando/retiradas. RN03 acaba quando o balcão zera.
- RN05/RN06 reserva só com estoque, de 1 a 10 pães. RN07 reserva expira 60 min após a fornada.
- RN09 alerta com 10 ou menos. RN10 cancelar inscrição apaga os dados. RN11 "não confirmada" após 2 h sem atualização.
- RF07 aviso por e-mail: 1 envio por vez que o pão fica disponível, mínimo 30 min entre envios (`reivindicar_aviso`).
- RF16 a RF19 relatórios: vendas = balcão + reservas retiradas (`relatorio_vendas`). RF21 QR Code. RF22 CSV.

## Estado atual (21/11/2026)
- Sistema completo e no ar. Feito nesta etapa: revisão de uso, "Minha reserva", ajustes visuais, sobras da fornada e relatório de produção.
- Funções públicas: `disponibilidade`, `criar_reserva` (devolve código e prazo), `inscrever`, `cancelar_inscricao`, `minhas_reservas`, `alterar_reserva`, `cancelar_reserva` (estas três buscam pelo e-mail ou telefone, sem código, por decisão do autor).
- Funções da loja: `nova_fornada` (separa feitos, `sobra` e `descarte`), `relatorio_vendas`, `relatorio_producao`.
- Balcão = feitos + sobra - vendas - reservas aguardando/retiradas.
- Antes do push, rodar o `schema.sql` no Supabase quando ele mudar (o front usa as funções novas).
- Próximos passos e ideias pendentes: seção "Próximos passos" do README.

## Identidade visual (até sair o logo)
- Marca: losango azul (quadrado girado 45°) + "via rápida" em Bricolage Grotesque 700 + "mercado" em Figtree 500 cinza.
- Cores: azul `#1D4ED8`, texto `#101828`, cinza `#667085`, verde "tem pão" `#12804A` sobre `#E8F6EE`. Fundo branco, tema claro.
- Onde a marca aparece: cabeçalho (`.brand`), `img/favicon.svg`, `img/icone-180.png`, `img/compartilhar.png` (prévia do WhatsApp, 1200x630), cartaz do QR Code e e-mail do aviso (só texto).

## Testar
- Servir a pasta com `npx serve .` e abrir `index.html` / `login.html`.
- Testar em 360px de largura (RNF01).
