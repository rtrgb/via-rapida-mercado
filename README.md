# Via Rápida Mercado

Sistema Web da Via Rápida Mercado (Balneário Camboriú, SC): mostra aos clientes se tem pão francês no balcão, avisa por e-mail quando sai uma fornada, permite reservar e dá à loja um painel com relatórios de vendas.

Projeto de extensão da disciplina de Programação Web, Univali, 2026. Autor: Gabriel Almeida Buzzi. Orientador: Prof. Dr. Jhonatan Alves.

## Tecnologias

- **Front-end:** HTML, CSS e JavaScript, sem framework. Hospedado no GitHub Pages.
- **Back-end:** [Supabase](https://supabase.com) (PostgreSQL, autenticação, regras de acesso por linha, tempo real e Edge Functions), plano gratuito.
- **E-mail:** [Brevo](https://www.brevo.com), plano gratuito (300 e-mails por dia).

## Estrutura

```
index.html                  página pública "Tem pão?"
aviso.html                  inscrição para o aviso por e-mail
cancelar.html               cancelamento do aviso (link do e-mail)
reserva.html                reserva e código de retirada
minha-reserva.html          cliente consulta, altera ou cancela a própria reserva
login.html                  entrada da loja
painel.html                 painel: situação, fornadas, vendas e próxima fornada
reservas.html               reservas do dia
relatorios.html             relatórios de vendas, gráficos, horários de pico e CSV
qrcode.html                 cartaz com QR Code para imprimir
css/style.css               estilos
img/                        ícone e imagem da prévia do link (WhatsApp)
js/config.js                URL e chave pública do Supabase
js/db.js                    conexão com o Supabase usada pelas páginas
js/disponibilidade.js       leitura da situação e atualização em tempo real
js/aviso.js, js/cancelar.js, js/reserva.js, js/minha-reserva.js
js/auth.js                  sessão da loja (protege o painel)
js/login.js, js/painel.js, js/reservas.js, js/relatorios.js, js/qrcode.js
supabase/schema.sql         script do banco: tabelas, regras, funções e permissões
supabase/functions/avisar/  envio do aviso "tem pão" por e-mail (Edge Function)
```

## Como rodar localmente

1. Crie um projeto gratuito em https://supabase.com.
2. No Supabase, abra **SQL Editor**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**. O script pode ser rodado mais de uma vez.
3. Em **Authentication > Sign In / Providers**, desative o cadastro público ("Allow new users to sign up"). Só a loja terá contas, criadas em **Authentication > Users > Add user**.
4. Copie a **Project URL** (botão **Connect**) e a chave **anon** (**Project Settings > API Keys > Legacy API keys**) para `js/config.js`.
5. Sirva a pasta com qualquer servidor estático, por exemplo `npx serve .` ou a extensão Live Server do VS Code, e abra `index.html`.

Para entrar no painel (`login.html`), crie o usuário da loja em **Authentication > Users > Add user** (marque "Auto Confirm User").

Para testar a página com pão disponível, insira uma fornada no **Table Editor** do Supabase (tabela `fornada`, `produto_id = 1`, `quantidade = 45`).

### Envio de e-mail (opcional para rodar localmente)

1. Crie uma conta no Brevo, verifique um remetente (**Settings > Senders**) e gere uma chave em **Settings > SMTP & API > API Keys**.
2. No Supabase, em **Edge Functions > Secrets**, crie `BREVO_API_KEY` (a chave) e `BREVO_SENDER_EMAIL` (o e-mail do remetente). Se o site não estiver no endereço padrão, crie também `SITE_URL`.
3. Em **Edge Functions > Deploy a new function > Via Editor**, crie a função `avisar` com o conteúdo de `supabase/functions/avisar/index.ts`.

O painel chama a função quando sai uma fornada ou quando a loja marca "tem pão". O banco libera um envio por vez que o pão fica disponível, com pelo menos 30 minutos entre envios. As chaves do Brevo e a `service_role` ficam só nos secrets do Supabase, nunca no código.

## Publicação

O front-end é publicado pelo GitHub Pages (Settings > Pages > Branch: `main`, pasta `/`). O banco fica no Supabase. A chave anon é pública por natureza; a proteção dos dados está nas regras de acesso do `schema.sql`: o visitante só consegue ler a disponibilidade, se inscrever, reservar e consultar, alterar ou cancelar a própria reserva (pelo e-mail ou telefone usado nela). Todo o resto exige login da loja.

## Regras de negócio implementadas no banco

| Regra | Onde |
| --- | --- |
| Balcão = fornada atual (feitos + sobra) - vendas - reservas ativas (RN02) | `calc_balcao` |
| Acabou quando o balcão zera (RN03) | gatilho de `venda` |
| Reserva só com estoque e de 1 a 10 pães (RN05, RN06) | `criar_reserva` |
| Reserva expira 60 min após a fornada (RN07) | `expirar_reservas`; o prazo volta em `criar_reserva` |
| Cliente consulta, altera (1 a 10, com estoque) ou cancela a reserva | `minhas_reservas`, `alterar_reserva`, `cancelar_reserva` |
| Aviso de situação não confirmada após 2 h (RN11) | `disponibilidade` |
| Não vender mais do que há no balcão | gatilho `venda_check` |
| Desfazer venda: se tinha zerado o balcão, volta a ter pão | gatilho `venda_delete` |
| Corrigir fornada: nunca menos do que já saiu | gatilhos `fornada_check` e `fornada_update` |
| Nova fornada guarda separado os pães feitos e a sobra da anterior (somada ao balcão ou descartada) | `nova_fornada`, colunas `sobra` e `descarte` |
| Cancelamento da inscrição apaga os dados (RN10) | `cancelar_inscricao` |
| Um aviso por e-mail por vez que o pão fica disponível (RF07) | `reivindicar_aviso` |
| Vendas = balcão + reservas retiradas, por dia e hora (RF16 a RF19) | `relatorio_vendas` |
| Produção e descarte por dia (pães feitos e sobras não somadas) | `relatorio_producao` |

## Andamento

- [x] Banco de dados, regras de acesso e funções públicas
- [x] Página pública "Tem pão?" com tempo real
- [x] Inscrição e cancelamento do aviso por e-mail
- [x] Envio do e-mail quando sai a fornada
- [x] Reserva e confirmação
- [x] Login e painel do vendedor
- [x] Reservas do dia
- [x] Relatórios
- [x] QR Code
- [x] Revisão antes da apresentação: desfazer venda, corrigir fornada, avisos do e-mail, login, painel no celular
- [x] Minha reserva (cliente consulta, altera e cancela)
- [x] Ajustes visuais: quadro "Tem pão?" colorido, ícone, prévia do link, login, tabelas e espaçamentos
