# Controle Financeiro Pessoal

Sistema web monolítico para controle de receitas e despesas, baseado na planilha `controle_financeiro_pessoal.xlsx`.

- **Back-end:** C# / ASP.NET Core (.NET 10) + Entity Framework Core + **SQL Server**
- **Front-end:** React + Material UI (Vite), servido pelo próprio ASP.NET Core (um único processo)
- **Segurança:** ASP.NET Core Identity, cookie HttpOnly/SameSite=Strict, bloqueio por tentativas, rate limiting, CSP

## Pré-requisitos

| Item | Observação |
|---|---|
| .NET SDK 10 | `dotnet --version` (para .NET 8, veja "Usar outra versão do .NET") |
| Node.js 20+ | usado para compilar o front-end |
| SQL Server | LocalDB (Windows), SQL Server Express, ou Docker (`docker compose up -d`) |

## Como executar

```bash
dotnet run
```

Na primeira execução o projeto roda `npm install` + `npm run build` automaticamente (gera `wwwroot/`),
cria o banco `ControleFinanceiro` e abre em **https://localhost:7080** (ou http://localhost:5080).
Se o navegador reclamar do certificado: `dotnet dev-certs https --trust`.

Crie sua conta na aba **Criar conta**. Categorias e contas da planilha são criadas automaticamente.

### Banco de dados

A string de conexão fica em `appsettings.json` (padrão: LocalDB). Para outra instância, sem editar arquivos:

```bash
# SQL Server Express
dotnet user-secrets set "ConnectionStrings:Default" "Server=localhost\SQLEXPRESS;Database=ControleFinanceiro;Trusted_Connection=True;TrustServerCertificate=True"

# SQL Server no Docker (docker compose up -d)
dotnet user-secrets set "ConnectionStrings:Default" "Server=localhost,1433;Database=ControleFinanceiro;User Id=sa;Password=Controle@Fin2026;TrustServerCertificate=True"
```

> LocalDB só existe no Windows. No Linux/macOS use o Docker.

### Desenvolvimento do front-end (hot reload)

```bash
dotnet run                 # terminal 1 (API em http://localhost:5080)
cd ClientApp && npm run dev  # terminal 2 -> http://localhost:5173
```

Para recompilar o front-end para o `wwwroot`: `cd ClientApp && npm run build`.

## Mapeamento da planilha

| Planilha | Sistema |
|---|---|
| Aba **Lançamentos** (data, tipo, categoria, descrição, conta, valor, status; "Mês" derivado da data) | Tela **Lançamentos** + tabela `Lancamentos` |
| Aba **Listas** (categorias, contas, tipo, status) | Tela **Cadastros** + tabelas `Categorias` e `Contas` (editáveis) |
| Aba **Orçamento** (limite, realizado, disponível, % do limite) | Tela **Orçamento** (limite fica em `Categorias.LimiteMensal`) |
| Aba **Resumo** (mês de referência, indicadores, despesas por categoria) | Tela **Resumo** + seletor de mês na barra superior |

Regras preservadas: valores sempre positivos (o tipo define receita/despesa); o "realizado" considera somente
lançamentos **Pago/Recebido**; os "pendentes" somam os lançamentos com status **Pendente**.
Cada usuário tem seus próprios dados, totalmente isolados.

## Segurança implementada

- Senhas com hash PBKDF2 (ASP.NET Core Identity); política: 8+ caracteres, maiúscula, minúscula e número
- Bloqueio da conta por 10 min após 5 tentativas erradas; limite de 10 requisições/min por IP nos endpoints de login
- Mensagem única para "usuário ou senha inválidos" (não revela se o e-mail existe)
- Sessão em cookie `HttpOnly` + `SameSite=Strict` (+ `Secure` em HTTPS), expira em 8h de inatividade — sem tokens no `localStorage`
- Proteção CSRF: cabeçalho `X-Requested-With` obrigatório em POST/PUT/PATCH/DELETE
- Todas as consultas filtram pelo usuário logado; categoria/conta informadas são validadas contra o dono
- Cabeçalhos: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS (fora de Development)
- Validação no servidor (DataAnnotations) e constraint `Valor > 0` no banco; EF Core parametriza todas as consultas

## Estrutura

```
Program.cs            configuração: Identity, cookie, rate limit, headers, SPA fallback
Controllers/          Auth, Lancamentos, Categorias, Contas, Resumo, Orcamento
Models/ Data/ Dtos/   entidades, DbContext, contratos da API
Services/             dados iniciais (Listas), mensagens do Identity em pt-BR
ClientApp/            React + MUI (src/pages, src/components, src/auth)
wwwroot/              build do React (gerado)
```

## Observações

- O banco é criado com `EnsureCreated` (simples para uso local). Para evoluir o esquema com migrations:
  remova a chamada em `DadosIniciais.InicializarBancoAsync`, rode `dotnet ef migrations add Inicial`
  e use `db.Database.Migrate()`.
- Para publicar em produção, sirva sempre por HTTPS e use um SQL Server com credenciais próprias.

## Usar outra versão do .NET

Para .NET 8, altere `TargetFramework` para `net8.0` e as versões dos pacotes `10.0.*` para `8.0.*` no `.csproj`.

## GitHub Codespaces

O projeto inclui `.devcontainer/` (instala .NET 10, Node 20 e Docker, e sobe o SQL Server sozinho).
Crie o codespace e, no terminal, execute: `dotnet run --urls http://localhost:5080`
