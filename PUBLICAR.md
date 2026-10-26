# Publicando o Controle Financeiro na internet

O projeto é um único processo (ASP.NET Core + React compilado) que precisa de **SQL Server** e de **HTTPS**.
Escolha um dos caminhos abaixo.

> Preços e limites de planos gratuitos mudam com frequência — confira a página de preços de cada provedor antes de decidir.

## 0. Antes de tudo: o domínio e o Google

1. Tenha um domínio (ex.: `financas.seudominio.com.br`) apontando para o servidor. Sem HTTPS **não publique**: o cookie de login só funciona em HTTPS fora de Development.
2. No Google Cloud Console, no mesmo ID do cliente OAuth, inclua `https://financas.seudominio.com.br` em **Origens JavaScript autorizadas**.
3. Em **Tela de permissão OAuth**, mude o status de *Teste* para *Em produção*. Como o app só pede `openid`, `email` e `profile`, não precisa de verificação do Google. (Em *Teste*, só e-mails cadastrados como testadores conseguem entrar.)

## Opção A — VPS com Docker (mais simples e barato, você controla tudo)

Requisitos: VPS Linux com **2 GB de RAM ou mais** (o SQL Server exige) e Docker instalado.

```bash
git clone https://github.com/ronxss/controle-financeiro.git && cd controle-financeiro
cp .env.example .env && nano .env          # senha do SQL, Google Client ID e domínio
docker compose -f docker-compose.prod.yml up -d --build
```

O Caddy emite e renova o certificado HTTPS sozinho (portas 80 e 443 precisam estar abertas). O banco **não** é exposto à internet.
Atualizar depois: `git pull && docker compose -f docker-compose.prod.yml up -d --build`.

## Opção B — Azure (App Service + Azure SQL)

É o caminho mais "nativo" para .NET + SQL Server, sem alterar código:

1. Crie um **Azure SQL Database** e libere o acesso do App Service (firewall / "Permitir serviços do Azure").
2. Crie um **App Service (Linux)** com a imagem Docker deste repositório (ou publique com `dotnet publish`) e ative **HTTPS Only**.
3. Em *Configuration → Application settings* defina:
   - `ConnectionStrings__Default` = string de conexão do Azure SQL
   - `Google__ClientId` = seu Client ID
   - `AllowedHosts` = seu domínio (ex.: `meuapp.azurewebsites.net`)
   - `ASPNETCORE_FORWARDEDHEADERS_ENABLED` = `true`
   - `DataProtection__Path` = `/home/keys` (a pasta `/home` persiste no App Service Linux)

## Opção C — PaaS gratuito/barato (Render, Railway, Fly.io…)

Esses serviços rodam bem o Dockerfile, mas raramente oferecem SQL Server barato. O caminho comum é **trocar o banco para PostgreSQL**
(pacote `Npgsql.EntityFrameworkCore.PostgreSQL`, ajustar a constraint `[Valor] > 0` para `"Valor" > 0` e a string de conexão).
É uma mudança pequena e localizada — dá para fazer se você preferir esse caminho.

## Variáveis de ambiente de produção

| Variável | Para quê |
|---|---|
| `ConnectionStrings__Default` | conexão com o SQL Server |
| `Google__ClientId` | habilita o login com Google |
| `AllowedHosts` | seu domínio (nunca `*` em produção) |
| `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` | atrás de proxy/HTTPS (necessário para IP real e rate limit corretos); já vem no Dockerfile |
| `DataProtection__Path` | pasta persistente das chaves do cookie (no Dockerfile: `/keys`) |

## Checklist de segurança antes de abrir ao público

- [ ] Rodando só em HTTPS (HSTS e cookie `Secure` já são ativados fora de Development)
- [ ] `AllowedHosts` com o seu domínio; senha forte no SQL Server; banco sem porta pública
- [ ] Nenhum segredo no Git (`.env` está no `.gitignore`; troque qualquer senha que já tenha sido commitada)
- [ ] **Backup** automático do banco (volume `sqldata` ou backup do Azure SQL) e um teste de restauração
- [ ] Trocar o usuário `sa` por um login com permissões só no banco `ControleFinanceiro`
- [ ] Migrations do EF Core no lugar de `EnsureCreated`, para evoluir o esquema sem perder dados
- [ ] Confirmação de e-mail no cadastro por senha (ainda não implementada) e, se possível, 2FA
- [ ] Monitoramento/logs e atualizações regulares das imagens Docker e dos pacotes
