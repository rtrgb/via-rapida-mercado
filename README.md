# Via Rápida Mercado

Sistema Web da Via Rápida Mercado (Balneário Camboriú, SC): mostra aos clientes se tem pão francês no balcão, avisa por e-mail quando sai uma fornada, permite reservar e dá à loja um painel com relatórios de vendas.

Projeto de extensão da disciplina de Programação Web, Univali, 2026. Autor: Gabriel Almeida Buzzi. Orientador: Prof. Dr. Jhonatan Alves.

## Tecnologias

- **Front-end:** HTML, CSS e JavaScript, sem framework. Hospedado no GitHub Pages.
- **Back-end:** [Supabase](https://supabase.com) (PostgreSQL, autenticação, regras de acesso por linha e tempo real), plano gratuito.

## Estrutura

```
index.html                  página pública "Tem pão?"
css/style.css               estilos
js/config.js                URL e chave pública do Supabase
js/disponibilidade.js       leitura da situação e atualização em tempo real
supabase/schema.sql         script do banco: tabelas, regras, funções e permissões
```

## Como rodar localmente

1. Crie um projeto gratuito em https://supabase.com.
2. No Supabase, abra **SQL Editor**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**. O script pode ser rodado mais de uma vez.
3. Em **Authentication > Sign In / Providers**, desative o cadastro público ("Allow new users to sign up"). Só a loja terá contas, criadas em **Authentication > Users > Add user**.
4. Em **Project Settings > API**, copie a **Project URL** e a chave **anon public** para `js/config.js`.
5. Sirva a pasta com qualquer servidor estático, por exemplo `npx serve .` ou a extensão Live Server do VS Code, e abra `index.html`.

Para testar a página com pão disponível, insira uma fornada no **Table Editor** do Supabase (tabela `fornada`, `produto_id = 1`, `quantidade = 45`).

## Publicação

O front-end é publicado pelo GitHub Pages (Settings > Pages > Branch: `main`, pasta `/`). O banco fica no Supabase. A chave anon é pública por natureza; a proteção dos dados está nas regras de acesso do `schema.sql`: o visitante só consegue ler a disponibilidade, reservar e se inscrever, e todo o resto exige login da loja.

## Regras de negócio implementadas no banco

| Regra | Onde |
| --- | --- |
| Balcão = fornada atual - vendas - reservas ativas (RN02) | `calc_balcao` |
| Acabou quando o balcão zera (RN03) | gatilho de `venda` |
| Reserva só com estoque e de 1 a 10 pães (RN05, RN06) | `criar_reserva` |
| Reserva expira 60 min após a fornada (RN07) | `expirar_reservas` |
| Aviso de situação não confirmada após 2 h (RN11) | `disponibilidade` |
| Não vender mais do que há no balcão | gatilho `venda_check` |
| Cancelamento da inscrição apaga os dados (RN10) | `cancelar_inscricao` |

## Andamento

- [x] Banco de dados, regras de acesso e funções públicas
- [x] Página pública "Tem pão?" com tempo real
- [ ] Aviso por e-mail (inscrição, envio e cancelamento)
- [ ] Reserva e confirmação
- [ ] Login e painel do vendedor
- [ ] Reservas do dia e relatórios
- [ ] QR Code
