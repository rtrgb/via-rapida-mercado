-- Via Rápida Mercado: banco de dados (Supabase / PostgreSQL)
-- Rode este arquivo inteiro no SQL Editor do Supabase.
-- Regras de negócio citadas: ver o documento de Análise de Requisitos.

create extension if not exists pgcrypto;

-- =========================================================
-- Tabelas
-- =========================================================

-- Produto vendido em fornadas. Hoje só o pão francês (RNF11: preparado para outros).
create table if not exists produto (
  id                  smallint generated always as identity primary key,
  nome                text not null,
  situacao            text not null default 'acabou' check (situacao in ('tem', 'acabou')),
  proxima_fornada     time,
  limite_alerta       int  not null default 10,  -- RN09
  horas_desatualizado int  not null default 2,   -- RN11
  atualizado_em       timestamptz not null default now(), -- última ação da loja
  versao              bigint not null default 0  -- muda a cada alteração; usado pelo tempo real
);

create table if not exists fornada (
  id          bigint generated always as identity primary key,
  produto_id  smallint not null references produto(id),
  quantidade  int not null check (quantidade > 0),
  criada_em   timestamptz not null default now()
);

create table if not exists venda (
  id          bigint generated always as identity primary key,
  fornada_id  bigint not null references fornada(id) on delete cascade,
  quantidade  int not null check (quantidade > 0),
  criada_em   timestamptz not null default now()
);

create table if not exists reserva (
  id           bigint generated always as identity primary key,
  codigo       text not null unique,
  produto_id   smallint not null references produto(id),
  fornada_id   bigint references fornada(id),          -- nulo = reservada para a próxima fornada
  nome         text not null check (char_length(nome) between 1 and 80),
  contato      text not null check (char_length(contato) between 3 and 120),
  quantidade   int  not null check (quantidade between 1 and 10), -- RN06
  status       text not null default 'aguardando'
               check (status in ('aguardando', 'retirada', 'nao_retirada', 'cancelada', 'expirada')),
  criada_em    timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

create table if not exists inscrito (
  id             bigint generated always as identity primary key,
  produto_id     smallint not null references produto(id),
  nome           text not null check (char_length(nome) between 1 and 80),
  email          text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  consentimento  boolean not null check (consentimento), -- RNF08 / LGPD
  token          uuid not null default gen_random_uuid() unique, -- link de cancelamento (RF06)
  criado_em      timestamptz not null default now(),
  unique (produto_id, email)
);

create index if not exists fornada_produto_idx on fornada (produto_id, criada_em desc);
create index if not exists venda_fornada_idx   on venda (fornada_id);
create index if not exists reserva_fornada_idx on reserva (fornada_id, status);

-- =========================================================
-- Gatilhos: mantêm a situação e a "versão" do produto
-- =========================================================

-- Nova fornada: marca "tem pão" e liga a ela as reservas feitas para a próxima fornada.
create or replace function on_fornada_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update reserva set fornada_id = new.id, atualizada_em = now()
   where produto_id = new.produto_id and fornada_id is null and status = 'aguardando';
  update produto set situacao = 'tem', atualizado_em = now(), versao = versao + 1
   where id = new.produto_id;
  return new;
end $$;

drop trigger if exists fornada_insert on fornada;
create trigger fornada_insert after insert on fornada
  for each row execute function on_fornada_insert();

-- Venda registrada: atualiza a hora e, se zerou o balcão, marca "acabou" (RN03).
create or replace function on_venda_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_produto smallint;
begin
  select produto_id into v_produto from fornada where id = new.fornada_id;
  update produto set atualizado_em = now(), versao = versao + 1 where id = v_produto;
  if (select no_balcao from calc_balcao(v_produto)) <= 0 then
    update produto set situacao = 'acabou' where id = v_produto;
  end if;
  return new;
end $$;

-- Reserva criada ou alterada: só avisa o tempo real (não conta como atualização da loja).
create or replace function on_reserva_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update produto set versao = versao + 1 where id = coalesce(new.produto_id, old.produto_id);
  return coalesce(new, old);
end $$;

-- =========================================================
-- Cálculo do balcão (RN02)
-- balcão = fornada atual - vendas - reservas aguardando ou retiradas
-- =========================================================
create or replace function calc_balcao(p_produto smallint)
returns table (fornada_id bigint, no_balcao int)
language sql stable security definer set search_path = public as $$
  with f as (
    select id, quantidade from fornada
     where produto_id = p_produto
     order by criada_em desc, id desc limit 1
  )
  select f.id,
         (f.quantidade
          - coalesce((select sum(quantidade) from venda where fornada_id = f.id), 0)
          - coalesce((select sum(quantidade) from reserva
                       where fornada_id = f.id and status in ('aguardando', 'retirada')), 0))::int
    from f
  union all
  select null, 0 where not exists (select 1 from f)
$$;

-- Não deixa vender mais do que há no balcão.
create or replace function on_venda_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_produto smallint; v_atual bigint; v_balcao int;
begin
  select produto_id into v_produto from fornada where id = new.fornada_id;
  select fornada_id, no_balcao into v_atual, v_balcao from calc_balcao(v_produto);
  if new.fornada_id <> v_atual then
    raise exception 'Só dá para registrar vendas da fornada atual.';
  end if;
  if new.quantidade > v_balcao then
    raise exception 'Só há % pães no balcão.', greatest(v_balcao, 0);
  end if;
  return new;
end $$;

drop trigger if exists venda_check on venda;
create trigger venda_check before insert on venda
  for each row execute function on_venda_check();

drop trigger if exists venda_insert on venda;
create trigger venda_insert after insert on venda
  for each row execute function on_venda_insert();

drop trigger if exists reserva_change on reserva;
create trigger reserva_change after insert or update on reserva
  for each row execute function on_reserva_change();

-- Reservas não retiradas em 60 minutos depois da fornada voltam para a venda (RN07).
create or replace function expirar_reservas() returns void
language sql security definer set search_path = public as $$
  update reserva r set status = 'expirada', atualizada_em = now()
    from fornada f
   where r.fornada_id = f.id and r.status = 'aguardando'
     and f.criada_em < now() - interval '60 minutes';
$$;

-- =========================================================
-- Funções públicas (as únicas que o visitante sem login pode chamar)
-- =========================================================

-- Situação para a página "Tem pão?" (RF02, RF03, RF04, RN11)
create or replace function disponibilidade(p_produto smallint default 1)
returns table (
  produto text, situacao text, no_balcao int, proxima_fornada time,
  atualizado_em timestamptz, desatualizado boolean, versao bigint
)
language plpgsql security definer set search_path = public as $$
begin
  perform expirar_reservas();
  return query
  select p.nome,
         case when p.situacao = 'tem' and b.no_balcao > 0 then 'tem' else 'acabou' end,
         case when p.situacao = 'tem' then greatest(b.no_balcao, 0) else 0 end,
         p.proxima_fornada,
         p.atualizado_em,
         (p.situacao = 'tem' and b.no_balcao > 0
           and now() - p.atualizado_em > make_interval(hours => p.horas_desatualizado)),
         p.versao
    from produto p cross join calc_balcao(p.id) b
   where p.id = p_produto;
end $$;

-- Reserva (RF08, RF09, RN05, RN06). Devolve o código para mostrar no caixa.
create or replace function criar_reserva(
  p_nome text, p_contato text, p_quantidade int,
  p_proxima boolean default false, p_produto smallint default 1
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_situacao text; v_fornada bigint; v_balcao int; v_codigo text;
begin
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 10 then
    raise exception 'A reserva deve ter de 1 a 10 pães.';
  end if;
  -- trava o produto para duas reservas simultâneas não passarem do estoque
  select situacao into v_situacao from produto where id = p_produto for update;
  if not found then raise exception 'Produto não encontrado.'; end if;
  perform expirar_reservas();

  if not p_proxima then
    select fornada_id, no_balcao into v_fornada, v_balcao from calc_balcao(p_produto);
    if v_situacao <> 'tem' or v_fornada is null or v_balcao < p_quantidade then
      raise exception 'Só há % pães no balcão. Reserve menos ou da próxima fornada.', greatest(coalesce(v_balcao, 0), 0);
    end if;
  end if;

  loop
    v_codigo := 'VR-' || upper(substr(md5(random()::text), 1, 4));
    exit when not exists (select 1 from reserva where codigo = v_codigo);
  end loop;

  insert into reserva (codigo, produto_id, fornada_id, nome, contato, quantidade)
  values (v_codigo, p_produto, case when p_proxima then null else v_fornada end,
          trim(p_nome), trim(p_contato), p_quantidade);
  return v_codigo;
end $$;

-- Inscrição para o aviso por e-mail (RF05)
create or replace function inscrever(
  p_nome text, p_email text, p_consentimento boolean, p_produto smallint default 1
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(p_consentimento, false) then
    raise exception 'É preciso aceitar o uso do e-mail para receber os avisos.';
  end if;
  insert into inscrito (produto_id, nome, email, consentimento)
  values (p_produto, trim(p_nome), lower(trim(p_email)), true)
  on conflict (produto_id, email) do update set nome = excluded.nome;
end $$;

-- Cancelamento pelo link do e-mail (RF06, RN10: os dados são apagados)
create or replace function cancelar_inscricao(p_token uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from inscrito where token = p_token;
  return found;
end $$;

-- =========================================================
-- Permissões (RNF07): RLS em tudo; o público só usa as funções acima
-- =========================================================
alter table produto  enable row level security;
alter table fornada  enable row level security;
alter table venda    enable row level security;
alter table reserva  enable row level security;
alter table inscrito enable row level security;

-- Visitante: só lê o produto (necessário para o tempo real).
drop policy if exists produto_leitura on produto;
create policy produto_leitura on produto for select to anon, authenticated using (true);

-- Loja (usuário com login: proprietária e funcionário do caixa): acesso total.
drop policy if exists produto_loja on produto;
create policy produto_loja on produto for update to authenticated using (true) with check (true);
drop policy if exists fornada_loja on fornada;
create policy fornada_loja on fornada for all to authenticated using (true) with check (true);
drop policy if exists venda_loja on venda;
create policy venda_loja on venda for all to authenticated using (true) with check (true);
drop policy if exists reserva_loja on reserva;
create policy reserva_loja on reserva for all to authenticated using (true) with check (true);
drop policy if exists inscrito_loja on inscrito;
create policy inscrito_loja on inscrito for select to authenticated using (true);

revoke execute on all functions in schema public from public, anon;
grant execute on function disponibilidade(smallint) to anon, authenticated;
grant execute on function criar_reserva(text, text, int, boolean, smallint) to anon, authenticated;
grant execute on function inscrever(text, text, boolean, smallint) to anon, authenticated;
grant execute on function cancelar_inscricao(uuid) to anon, authenticated;

-- Tempo real: a página pública escuta mudanças na tabela produto (RNF04)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and tablename = 'produto') then
    alter publication supabase_realtime add table produto;
  end if;
end $$;

-- =========================================================
-- Dados iniciais
-- =========================================================
insert into produto (nome, proxima_fornada)
select 'Pão francês', '07:30'
where not exists (select 1 from produto);
