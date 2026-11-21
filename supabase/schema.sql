-- banco do via rapida (supabase)
-- rodar tudo no sql editor
-- os RF/RN/RNF sao do doc de requisitos

create extension if not exists pgcrypto;

-- produto (RNF11)
create table if not exists produto (
  id                  smallint generated always as identity primary key,
  nome                text not null,
  situacao            text not null default 'acabou' check (situacao in ('tem', 'acabou')),
  proxima_fornada     time,
  limite_alerta       int  not null default 10,  -- RN09
  horas_desatualizado int  not null default 2,   -- RN11
  atualizado_em       timestamptz not null default now(), -- ultima acao da loja
  versao              bigint not null default 0  -- tempo real
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
  fornada_id   bigint references fornada(id),          -- null = proxima fornada
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
  consentimento  boolean not null check (consentimento), -- RNF08 lgpd
  token          uuid not null default gen_random_uuid() unique, -- pro link de cancelar (RF06)
  criado_em      timestamptz not null default now(),
  unique (produto_id, email)
);

-- colunas do aviso por e-mail (RF07); "if not exists" deixa rodar de novo num banco antigo
alter table produto add column if not exists disponivel_desde timestamptz;
alter table produto add column if not exists avisado_em timestamptz;

-- sobras da fornada anterior (RN02 e relatorios): separadas dos paes que sairam do forno
-- sobra = entrou no balcao desta fornada; descarte = a loja escolheu nao vender
alter table fornada add column if not exists sobra    int not null default 0;
alter table fornada add column if not exists descarte int not null default 0;
do $$ begin
  alter table fornada add constraint fornada_sobra_ok check (sobra >= 0 and descarte >= 0);
exception when duplicate_object then null; end $$;

create index if not exists fornada_produto_idx on fornada (produto_id, criada_em desc);
create index if not exists venda_fornada_idx   on venda (fornada_id);
create index if not exists reserva_fornada_idx on reserva (fornada_id, status);
create index if not exists venda_data_idx      on venda (criada_em);
create index if not exists reserva_data_idx    on reserva (status, atualizada_em);

-- GATILHOS

-- fornada nova -> tem pao, libera o aviso por e-mail e liga as reservas pendentes
create or replace function on_fornada_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update reserva set fornada_id = new.id, atualizada_em = now()
   where produto_id = new.produto_id and fornada_id is null and status = 'aguardando';
  update produto set situacao = 'tem', disponivel_desde = now(), atualizado_em = now(), versao = versao + 1
   where id = new.produto_id;
  return new;
end $$;

drop trigger if exists fornada_insert on fornada;
create trigger fornada_insert after insert on fornada
  for each row execute function on_fornada_insert();

-- venda: se zerar o balcao marca acabou (RN03)
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

-- reserva so dispara o tempo real
create or replace function on_reserva_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update produto set versao = versao + 1 where id = coalesce(new.produto_id, old.produto_id);
  return coalesce(new, old);
end $$;

-- guarda quando o pao voltou a ficar disponivel (RF07)
create or replace function on_produto_update() returns trigger
language plpgsql as $$
begin
  if new.situacao = 'tem' and old.situacao is distinct from 'tem' then
    new.disponivel_desde := now();
  end if;
  return new;
end $$;

drop trigger if exists produto_update on produto;
create trigger produto_update before update on produto
  for each row execute function on_produto_update();

-- BALCAO (RN02)
-- fornada (feitos + sobra) - vendas - reservas (aguardando/retiradas)
create or replace function calc_balcao(p_produto smallint)
returns table (fornada_id bigint, no_balcao int)
language sql stable security definer set search_path = public as $$
  with f as (
    select id, quantidade + sobra as quantidade from fornada
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

-- nao deixa vender mais q o balcao
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

-- desfazer venda: se a venda tinha zerado o balcao, volta a ter pao
create or replace function on_venda_delete() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_produto smallint; v_atual bigint; v_balcao int;
begin
  select produto_id into v_produto from fornada where id = old.fornada_id;
  if v_produto is null then return old; end if; -- fornada apagada junto
  select fornada_id, no_balcao into v_atual, v_balcao from calc_balcao(v_produto);
  update produto set atualizado_em = now(), versao = versao + 1,
         situacao = case when v_atual = old.fornada_id and v_balcao > 0 and v_balcao - old.quantidade <= 0
                         then 'tem' else situacao end
   where id = v_produto;
  return old;
end $$;

drop trigger if exists venda_delete on venda;
create trigger venda_delete after delete on venda
  for each row execute function on_venda_delete();

-- corrigir fornada: so a quantidade, e nunca menos do que ja saiu
create or replace function on_fornada_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_saiu int;
begin
  if new.produto_id <> old.produto_id or new.criada_em <> old.criada_em
     or new.sobra <> old.sobra or new.descarte <> old.descarte then
    raise exception 'Só dá para corrigir a quantidade da fornada.';
  end if;
  select coalesce((select sum(quantidade) from venda where fornada_id = old.id), 0)
       + coalesce((select sum(quantidade) from reserva
                    where fornada_id = old.id and status in ('aguardando', 'retirada')), 0)
    into v_saiu;
  if new.quantidade + new.sobra < v_saiu then
    raise exception 'Já saíram % pães desta fornada (vendas e reservas). A quantidade não pode ser menor.', v_saiu;
  end if;
  return new;
end $$;

drop trigger if exists fornada_check on fornada;
create trigger fornada_check before update on fornada
  for each row execute function on_fornada_check();

-- depois de corrigir: zerou -> acabou (RN03); estava zerado e voltou -> tem
create or replace function on_fornada_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_atual bigint; v_balcao int;
begin
  select fornada_id, no_balcao into v_atual, v_balcao from calc_balcao(new.produto_id);
  update produto set atualizado_em = now(), versao = versao + 1,
         situacao = case
           when v_atual is distinct from new.id then situacao
           when v_balcao <= 0 then 'acabou'
           when v_balcao - (new.quantidade - old.quantidade) <= 0 then 'tem'
           else situacao end
   where id = new.produto_id;
  return new;
end $$;

drop trigger if exists fornada_update on fornada;
create trigger fornada_update after update of quantidade on fornada
  for each row execute function on_fornada_update();

-- reserva q nao retirou em 60min volta pra venda (RN07)
create or replace function expirar_reservas() returns void
language sql security definer set search_path = public as $$
  update reserva r set status = 'expirada', atualizada_em = now()
    from fornada f
   where r.fornada_id = f.id and r.status = 'aguardando'
     and f.criada_em < now() - interval '60 minutes';
$$;

-- FUNCOES PUBLICAS

-- pagina tem pao (RF02 RF03 RF04 RN11)
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

-- reserva (RF08 RF09 RN05 RN06)
-- devolve o codigo e o prazo de retirada (RN07); prazo nulo = proxima fornada
-- o drop deixa trocar o retorno antigo (so o codigo) por este
drop function if exists criar_reserva(text, text, int, boolean, smallint);
create or replace function criar_reserva(
  p_nome text, p_contato text, p_quantidade int,
  p_proxima boolean default false, p_produto smallint default 1
) returns table (codigo text, prazo timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_situacao text; v_fornada bigint; v_balcao int; v_codigo text; v_prazo timestamptz;
begin
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 10 then
    raise exception 'A reserva deve ter de 1 a 10 pães.';
  end if;
  select situacao into v_situacao from produto where id = p_produto for update;
  if not found then raise exception 'Produto não encontrado.'; end if;
  perform expirar_reservas();

  if not p_proxima then
    select fornada_id, no_balcao into v_fornada, v_balcao from calc_balcao(p_produto);
    if v_situacao <> 'tem' or v_fornada is null or v_balcao < p_quantidade then
      raise exception 'Só há % pães no balcão. Reserve menos ou da próxima fornada.', greatest(coalesce(v_balcao, 0), 0);
    end if;
    select f.criada_em + interval '60 minutes' into v_prazo from fornada f where f.id = v_fornada;
  end if;

  loop
    v_codigo := 'VR-' || upper(substr(md5(random()::text), 1, 4));
    exit when not exists (select 1 from reserva r where r.codigo = v_codigo);
  end loop;

  insert into reserva (codigo, produto_id, fornada_id, nome, contato, quantidade)
  values (v_codigo, p_produto, case when p_proxima then null else v_fornada end,
          trim(p_nome), trim(p_contato), p_quantidade);
  return query select v_codigo, v_prazo;
end $$;

-- contato comparavel: e-mail minusculo, telefone so com os digitos
create or replace function norm_contato(t text) returns text
language sql immutable set search_path = public as $$
  select case when t like '%@%' then lower(trim(t)) else regexp_replace(coalesce(t, ''), '\D', '', 'g') end
$$;

-- cliente ve as proprias reservas pelo e-mail ou telefone usado
create or replace function minhas_reservas(p_contato text)
returns table (codigo text, quantidade int, status text, proxima boolean, prazo timestamptz, criada_em timestamptz)
language plpgsql security definer set search_path = public as $$
declare v text := norm_contato(p_contato);
begin
  if char_length(v) < 3 then raise exception 'Informe o e-mail ou telefone usado na reserva.'; end if;
  perform expirar_reservas();
  return query
  select r.codigo, r.quantidade, r.status, r.fornada_id is null,
         f.criada_em + interval '60 minutes', r.criada_em
    from reserva r left join fornada f on f.id = r.fornada_id
   where norm_contato(r.contato) = v
     and (r.status = 'aguardando' or r.criada_em > now() - interval '1 day')
   order by r.criada_em desc
   limit 20;
end $$;

-- cliente cancela a propria reserva (os paes voltam ao balcao)
create or replace function cancelar_reserva(p_codigo text, p_contato text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  perform expirar_reservas();
  select id into v_id from reserva
   where codigo = upper(trim(p_codigo)) and status = 'aguardando'
     and char_length(norm_contato(p_contato)) >= 3
     and norm_contato(contato) = norm_contato(p_contato)
   for update;
  if not found then raise exception 'Reserva não encontrada ou já encerrada.'; end if;
  update reserva set status = 'cancelada', atualizada_em = now() where id = v_id;
end $$;

-- cliente muda a quantidade (RN06); para aumentar precisa ter pao no balcao (RN05)
create or replace function alterar_reserva(p_codigo text, p_contato text, p_quantidade int) returns void
language plpgsql security definer set search_path = public as $$
declare r reserva%rowtype; v_produto smallint; v_situacao text; v_atual bigint; v_balcao int;
begin
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 10 then
    raise exception 'A reserva deve ter de 1 a 10 pães.';
  end if;
  -- mesma trava do criar_reserva
  select produto_id into v_produto from reserva where codigo = upper(trim(p_codigo));
  select situacao into v_situacao from produto where id = v_produto for update;
  perform expirar_reservas();
  select * into r from reserva
   where codigo = upper(trim(p_codigo)) and status = 'aguardando'
     and char_length(norm_contato(p_contato)) >= 3
     and norm_contato(contato) = norm_contato(p_contato)
   for update;
  if not found then raise exception 'Reserva não encontrada ou já encerrada.'; end if;

  if r.fornada_id is not null and p_quantidade > r.quantidade then
    select fornada_id, no_balcao into v_atual, v_balcao from calc_balcao(r.produto_id);
    if v_situacao <> 'tem' or v_atual is distinct from r.fornada_id then v_balcao := 0; end if;
    if greatest(v_balcao, 0) < p_quantidade - r.quantidade then
      raise exception 'Só dá para aumentar até % pães agora.', r.quantidade + greatest(v_balcao, 0);
    end if;
  end if;
  update reserva set quantidade = p_quantidade, atualizada_em = now() where id = r.id;
end $$;

-- inscricao do aviso por email (RF05)
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

-- cancelar inscricao, apaga os dados (RF06 RN10)
create or replace function cancelar_inscricao(p_token uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from inscrito where token = p_token;
  return found;
end $$;

-- FUNCOES DA LOJA

-- nova fornada: guarda separado os paes que sairam e a sobra da anterior,
-- que entra no balcao (p_somar_sobra) ou fica como descarte
create or replace function nova_fornada(p_quantidade int, p_somar_sobra boolean default true, p_produto smallint default 1)
returns table (fornada_id bigint, sobra int, descarte int)
language plpgsql security definer set search_path = public as $$
declare v_sobra int; v_id bigint; v_s int; v_d int;
begin
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 999 then
    raise exception 'Informe quantos pães saíram (de 1 a 999).';
  end if;
  perform 1 from produto where id = p_produto for update; -- mesma trava das reservas
  if not found then raise exception 'Produto não encontrado.'; end if;
  perform expirar_reservas();
  select greatest(coalesce(b.no_balcao, 0), 0) into v_sobra from calc_balcao(p_produto) b;
  v_s := case when coalesce(p_somar_sobra, true) then v_sobra else 0 end;
  v_d := v_sobra - v_s;
  insert into fornada (produto_id, quantidade, sobra, descarte)
  values (p_produto, p_quantidade, v_s, v_d) returning id into v_id;
  return query select v_id, v_s, v_d;
end $$;

-- trava do aviso: libera 1 envio por vez que o pao fica disponivel,
-- com no minimo 30 min entre envios (evita spam se ligar/desligar)
create or replace function reivindicar_aviso(p_produto smallint default 1) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update produto set avisado_em = now()
   where id = p_produto and situacao = 'tem' and disponivel_desde is not null
     and (avisado_em is null
          or (avisado_em < disponivel_desde and avisado_em < now() - interval '30 minutes'));
  return found;
end $$;

-- relatorios (RF16 a RF19, RF22): vendas no balcao + reservas retiradas, por dia e hora
create or replace function relatorio_vendas(p_de date, p_ate date)
returns table (dia date, hora int, balcao int, reservas int)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_ini timestamptz := p_de::timestamp at time zone 'America/Sao_Paulo';
  v_fim timestamptz := (p_ate + 1)::timestamp at time zone 'America/Sao_Paulo';
begin
  if p_ate < p_de or p_ate - p_de > 366 then
    raise exception 'Escolha um período de até 1 ano.';
  end if;
  return query
  with ev as (
    select criada_em at time zone 'America/Sao_Paulo' as t, quantidade as b, 0 as r
      from venda where criada_em >= v_ini and criada_em < v_fim
    union all
    select atualizada_em at time zone 'America/Sao_Paulo', 0, quantidade
      from reserva where status = 'retirada' and atualizada_em >= v_ini and atualizada_em < v_fim
  )
  select ev.t::date, extract(hour from ev.t)::int, sum(ev.b)::int, sum(ev.r)::int
    from ev group by 1, 2 order by 1, 2;
end $$;

-- relatorios: producao por dia (feitos e descarte das sobras); o descarte entra no dia
-- da fornada em que a loja escolheu nao somar a sobra
create or replace function relatorio_producao(p_de date, p_ate date)
returns table (dia date, feitos int, descarte int)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_ini timestamptz := p_de::timestamp at time zone 'America/Sao_Paulo';
  v_fim timestamptz := (p_ate + 1)::timestamp at time zone 'America/Sao_Paulo';
begin
  if p_ate < p_de or p_ate - p_de > 366 then
    raise exception 'Escolha um período de até 1 ano.';
  end if;
  return query
  select (f.criada_em at time zone 'America/Sao_Paulo')::date, sum(f.quantidade)::int, sum(f.descarte)::int
    from fornada f
   where f.criada_em >= v_ini and f.criada_em < v_fim
   group by 1 order by 1;
end $$;

-- PERMISSOES (RNF07)
alter table produto  enable row level security;
alter table fornada  enable row level security;
alter table venda    enable row level security;
alter table reserva  enable row level security;
alter table inscrito enable row level security;

-- visitante so le o produto
drop policy if exists produto_leitura on produto;
create policy produto_leitura on produto for select to anon, authenticated using (true);

-- loja logada pode tudo
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
grant execute on function minhas_reservas(text) to anon, authenticated;
grant execute on function cancelar_reserva(text, text) to anon, authenticated;
grant execute on function alterar_reserva(text, text, int) to anon, authenticated;
grant execute on function relatorio_vendas(date, date) to authenticated;
grant execute on function relatorio_producao(date, date) to authenticated;
grant execute on function nova_fornada(int, boolean, smallint) to authenticated;
revoke execute on function reivindicar_aviso(smallint) from authenticated;
grant execute on function reivindicar_aviso(smallint) to service_role;
grant execute on function disponibilidade(smallint) to service_role;

-- realtime (RNF04)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and tablename = 'produto') then
    alter publication supabase_realtime add table produto;
  end if;
end $$;

-- DADOS INICIAIS
insert into produto (nome, proxima_fornada)
select 'Pão francês', '07:30'
where not exists (select 1 from produto);
