using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ControleFinanceiro.Controllers;

/// <summary>Base dos controllers protegidos: exige login e expõe o Id do usuário autenticado.</summary>
[ApiController, Authorize]
public abstract class ApiBase : ControllerBase
{
    protected string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new InvalidOperationException("Usuário não autenticado.");

    protected IActionResult Erro(string mensagem) => BadRequest(new { mensagem });
    protected IActionResult Conflito(string mensagem) => Conflict(new { mensagem });
    protected IActionResult NaoEncontrado() => NotFound(new { mensagem = "Registro não encontrado." });
}
