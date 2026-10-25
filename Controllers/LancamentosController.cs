using ControleFinanceiro.Data;
using ControleFinanceiro.Dtos;
using ControleFinanceiro.Models;
using ControleFinanceiro.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ControleFinanceiro.Controllers;

[Route("api/lancamentos")]
public class LancamentosController(AppDbContext db) : ApiBase
{
    [HttpGet]
    public async Task<IActionResult> Listar(
        [FromQuery] string? mes, [FromQuery] TipoLancamento? tipo, [FromQuery] int? categoriaId,
        [FromQuery] int? contaId, [FromQuery] StatusLancamento? status, [FromQuery] string? busca)
    {
        if (!Periodo.TentarObter(mes, out var inicio, out var fim))
            return Erro("Mês inválido. Use o formato AAAA-MM.");

        var userId = UserId;
        var q = db.Lancamentos.AsNoTracking()
            .Where(l => l.UserId == userId && l.Data >= inicio && l.Data < fim);

        if (tipo.HasValue) q = q.Where(l => l.Tipo == tipo.Value);
        if (categoriaId.HasValue) q = q.Where(l => l.CategoriaId == categoriaId.Value);
        if (contaId.HasValue) q = q.Where(l => l.ContaId == contaId.Value);
        if (status.HasValue) q = q.Where(l => l.Status == status.Value);
        if (!string.IsNullOrWhiteSpace(busca))
        {
            var termo = busca.Trim();
            q = q.Where(l => l.Descricao.Contains(termo));
        }

        var itens = await q
            .OrderByDescending(l => l.Data).ThenByDescending(l => l.Id)
            .Select(l => new LancamentoDto(l.Id, l.Data, l.Tipo, l.CategoriaId, l.Categoria.Nome,
                l.Descricao, l.ContaId, l.Conta.Nome, l.Valor, l.Status))
            .ToListAsync();

        return Ok(itens);
    }

    [HttpPost]
    public async Task<IActionResult> Criar(LancamentoRequest req)
    {
        var erro = await ValidarAsync(req);
        if (erro is not null) return Erro(erro);

        var l = new Lancamento { UserId = UserId };
        Aplicar(l, req);
        db.Lancamentos.Add(l);
        await db.SaveChangesAsync();
        return Ok(new { l.Id });
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Atualizar(int id, LancamentoRequest req)
    {
        var userId = UserId;
        var l = await db.Lancamentos.FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId);
        if (l is null) return NaoEncontrado();

        var erro = await ValidarAsync(req);
        if (erro is not null) return Erro(erro);

        Aplicar(l, req);
        await db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Alterna rapidamente entre Pendente e Pago/Recebido.</summary>
    [HttpPatch("{id:int}/status")]
    public async Task<IActionResult> AlterarStatus(int id, StatusRequest req)
    {
        var userId = UserId;
        var l = await db.Lancamentos.FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId);
        if (l is null) return NaoEncontrado();

        l.Status = req.Status!.Value;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Excluir(int id)
    {
        var userId = UserId;
        var l = await db.Lancamentos.FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId);
        if (l is null) return NaoEncontrado();

        db.Lancamentos.Remove(l);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static void Aplicar(Lancamento l, LancamentoRequest r)
    {
        l.Data = r.Data!.Value;
        l.Tipo = r.Tipo!.Value;
        l.CategoriaId = r.CategoriaId!.Value;
        l.Descricao = r.Descricao.Trim();
        l.ContaId = r.ContaId!.Value;
        l.Valor = Math.Round(r.Valor, 2);
        l.Status = r.Status!.Value;
    }

    /// <summary>Garante que categoria e conta pertencem ao usuário e que a categoria combina com o tipo.</summary>
    private async Task<string?> ValidarAsync(LancamentoRequest r)
    {
        var userId = UserId;
        var categoriaId = r.CategoriaId!.Value;
        var contaId = r.ContaId!.Value;

        var cat = await db.Categorias.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == categoriaId && c.UserId == userId);
        if (cat is null) return "Categoria inválida.";
        if (cat.Tipo != r.Tipo) return "A categoria selecionada não corresponde ao tipo do lançamento.";

        var contaOk = await db.Contas.AnyAsync(c => c.Id == contaId && c.UserId == userId);
        if (!contaOk) return "Conta inválida.";

        return null;
    }
}
