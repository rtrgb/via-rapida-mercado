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
- Visitante (anon) só acessa as funções `disponibilidade`, `criar_reserva`, `inscrever` e `cancelar_inscricao`. Todo o resto exige login.
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

## Testar
- Servir a pasta com `npx serve .` e abrir `index.html` / `login.html`.
- Testar em 360px de largura (RNF01).
