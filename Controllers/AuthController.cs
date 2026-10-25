using ControleFinanceiro.Data;
using ControleFinanceiro.Dtos;
using ControleFinanceiro.Models;
using ControleFinanceiro.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace ControleFinanceiro.Controllers;

[ApiController, Route("api/auth")]
public class AuthController(
    UserManager<ApplicationUser> users,
    SignInManager<ApplicationUser> signIn,
    AppDbContext db) : ControllerBase
{
    [HttpPost("registrar"), EnableRateLimiting("auth")]
    public async Task<IActionResult> Registrar(RegistroRequest req)
    {
        var email = req.Email.Trim();
        var user = new ApplicationUser { UserName = email, Email = email, NomeCompleto = req.Nome.Trim() };

        var result = await users.CreateAsync(user, req.Senha);
        if (!result.Succeeded)
            return BadRequest(new { mensagem = string.Join(" ", result.Errors.Select(e => e.Description).Distinct()) });

        await DadosIniciais.CriarAsync(db, user.Id);
        await signIn.SignInAsync(user, isPersistent: false);
        return Ok(new UsuarioDto(user.NomeCompleto, email));
    }

    [HttpPost("entrar"), EnableRateLimiting("auth")]
    public async Task<IActionResult> Entrar(LoginRequest req)
    {
        var result = await signIn.PasswordSignInAsync(req.Email.Trim(), req.Senha, isPersistent: false, lockoutOnFailure: true);

        if (result.IsLockedOut)
            return StatusCode(StatusCodes.Status429TooManyRequests,
                new { mensagem = "Muitas tentativas incorretas. Conta bloqueada por 10 minutos." });
        if (!result.Succeeded)
            return Unauthorized(new { mensagem = "E-mail ou senha inválidos." }); // mesma mensagem para ambos os casos

        var user = await users.FindByNameAsync(req.Email.Trim());
        return Ok(new UsuarioDto(user!.NomeCompleto, user.Email!));
    }

    [HttpPost("sair")]
    public async Task<IActionResult> Sair()
    {
        await signIn.SignOutAsync();
        return NoContent();
    }

    [Authorize, HttpGet("eu")]
    public async Task<IActionResult> Eu()
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        return Ok(new UsuarioDto(user.NomeCompleto, user.Email!));
    }

    [Authorize, HttpPost("alterar-senha"), EnableRateLimiting("auth")]
    public async Task<IActionResult> AlterarSenha(AlterarSenhaRequest req)
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();

        var result = await users.ChangePasswordAsync(user, req.SenhaAtual, req.NovaSenha);
        if (!result.Succeeded)
            return BadRequest(new { mensagem = string.Join(" ", result.Errors.Select(e => e.Description).Distinct()) });

        await signIn.RefreshSignInAsync(user);
        return NoContent();
    }
}
