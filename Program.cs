using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using ControleFinanceiro.Data;
using ControleFinanceiro.Models;
using ControleFinanceiro.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// ---------- Banco de dados (SQL Server) ----------
var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? throw new InvalidOperationException("ConnectionStrings:Default não configurada.");
builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseSqlServer(connectionString, sql => sql.EnableRetryOnFailure()));

// ---------- Autenticação: ASP.NET Core Identity + cookie seguro ----------
builder.Services
    .AddIdentity<ApplicationUser, IdentityRole>(o =>
    {
        o.User.RequireUniqueEmail = true;

        o.Password.RequiredLength = 8;
        o.Password.RequireDigit = true;
        o.Password.RequireLowercase = true;
        o.Password.RequireUppercase = true;
        o.Password.RequireNonAlphanumeric = false;

        // Bloqueio por tentativas inválidas (força bruta)
        o.Lockout.AllowedForNewUsers = true;
        o.Lockout.MaxFailedAccessAttempts = 5;
        o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(10);
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddErrorDescriber<IdentityErrorDescriberPtBr>()
    .AddDefaultTokenProviders();

builder.Services.ConfigureApplicationCookie(o =>
{
    o.Cookie.Name = "cf.auth";
    o.Cookie.HttpOnly = true;                              // JavaScript não lê o cookie (mitiga XSS)
    o.Cookie.SameSite = SameSiteMode.Strict;               // não é enviado em requisições de outros sites (mitiga CSRF)
    o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest; // Secure quando acessado via HTTPS
    o.ExpireTimeSpan = TimeSpan.FromHours(8);
    o.SlidingExpiration = true;
    // API: devolve 401/403 em vez de redirecionar para uma página de login
    o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; };
    o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = StatusCodes.Status403Forbidden; return Task.CompletedTask; };
});

// ---------- Limite de requisições nos endpoints de autenticação ----------
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "local",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

builder.Services.AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

var app = builder.Build();

await using (var scope = app.Services.CreateAsyncScope())
{
    await DadosIniciais.InicializarBancoAsync(scope.ServiceProvider, app.Logger);
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler(a => a.Run(async ctx =>
    {
        ctx.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await ctx.Response.WriteAsJsonAsync(new { mensagem = "Erro interno do servidor." });
    }));
    app.UseHsts();
    app.UseHttpsRedirection();
}

// ---------- Cabeçalhos de segurança ----------
app.Use(async (ctx, next) =>
{
    var h = ctx.Response.Headers;
    h["X-Content-Type-Options"] = "nosniff";
    h["X-Frame-Options"] = "DENY";
    h["Referrer-Policy"] = "no-referrer";
    h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
    h["Content-Security-Policy"] =
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; font-src 'self' data:; connect-src 'self'; " +
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
    await next();
});

app.UseStaticFiles();
app.UseRouting();
app.UseRateLimiter();

// ---------- Proteção CSRF adicional ----------
// Toda requisição que altera dados exige um cabeçalho customizado. Outros sites não conseguem
// enviá-lo (exigiria CORS, que não está habilitado) e o cookie já é SameSite=Strict.
app.Use(async (ctx, next) =>
{
    var m = ctx.Request.Method;
    var altera = !(HttpMethods.IsGet(m) || HttpMethods.IsHead(m) || HttpMethods.IsOptions(m));
    if (altera && ctx.Request.Path.StartsWithSegments("/api")
        && ctx.Request.Headers["X-Requested-With"] != "XMLHttpRequest")
    {
        ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
        await ctx.Response.WriteAsJsonAsync(new { mensagem = "Requisição inválida." });
        return;
    }
    await next();
});

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapFallback("/api/{**rest}", () => Results.NotFound(new { mensagem = "Recurso não encontrado." }));
app.MapFallbackToFile("index.html"); // SPA React

app.Run();
