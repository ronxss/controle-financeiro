using System.ComponentModel.DataAnnotations;
using ControleFinanceiro.Models;

namespace ControleFinanceiro.Dtos;

// ---------- Autenticação ----------
public class RegistroRequest
{
    [Required(ErrorMessage = "Informe seu nome."), StringLength(100, MinimumLength = 2, ErrorMessage = "O nome deve ter entre 2 e 100 caracteres.")]
    public string Nome { get; set; } = "";

    [Required(ErrorMessage = "Informe o e-mail."), EmailAddress(ErrorMessage = "E-mail inválido."), StringLength(256)]
    public string Email { get; set; } = "";

    [Required(ErrorMessage = "Informe a senha."), StringLength(100, ErrorMessage = "A senha deve ter no máximo 100 caracteres.")]
    public string Senha { get; set; } = "";
}

public class LoginRequest
{
    [Required(ErrorMessage = "Informe o e-mail."), StringLength(256)]
    public string Email { get; set; } = "";

    [Required(ErrorMessage = "Informe a senha."), StringLength(100)]
    public string Senha { get; set; } = "";
}

public class AlterarSenhaRequest
{
    [Required(ErrorMessage = "Informe a senha atual."), StringLength(100)]
    public string SenhaAtual { get; set; } = "";

    [Required(ErrorMessage = "Informe a nova senha."), StringLength(100)]
    public string NovaSenha { get; set; } = "";
}

public class GoogleLoginRequest
{
    [Required(ErrorMessage = "Credencial do Google ausente."), StringLength(4096)]
    public string Credential { get; set; } = "";
}

/// <summary>TemSenha = false para contas criadas apenas via Google (não há senha para alterar).</summary>
public record UsuarioDto(string Nome, string Email, bool TemSenha);

// ---------- Lançamentos ----------
public class LancamentoRequest
{
    [Required(ErrorMessage = "Informe a data.")] public DateOnly? Data { get; set; }
    [Required(ErrorMessage = "Informe o tipo.")] public TipoLancamento? Tipo { get; set; }
    [Required(ErrorMessage = "Selecione a categoria.")] public int? CategoriaId { get; set; }

    [Required(ErrorMessage = "Informe a descrição."), StringLength(200, ErrorMessage = "A descrição deve ter no máximo 200 caracteres.")]
    public string Descricao { get; set; } = "";

    [Required(ErrorMessage = "Selecione a conta.")] public int? ContaId { get; set; }

    [Range(0.01, 999999999.99, ErrorMessage = "O valor deve ser maior que zero.")]
    public decimal Valor { get; set; }

    [Required(ErrorMessage = "Informe o status.")] public StatusLancamento? Status { get; set; }
}

public class StatusRequest
{
    [Required] public StatusLancamento? Status { get; set; }
}

public record LancamentoDto(
    int Id, DateOnly Data, TipoLancamento Tipo, int CategoriaId, string Categoria,
    string Descricao, int ContaId, string Conta, decimal Valor, StatusLancamento Status);

// ---------- Cadastros ----------
public class CategoriaRequest
{
    [Required(ErrorMessage = "Informe o nome."), StringLength(60, ErrorMessage = "O nome deve ter no máximo 60 caracteres.")]
    public string Nome { get; set; } = "";

    [Required(ErrorMessage = "Informe o tipo.")] public TipoLancamento? Tipo { get; set; }
}

public class ContaRequest
{
    [Required(ErrorMessage = "Informe o nome."), StringLength(60, ErrorMessage = "O nome deve ter no máximo 60 caracteres.")]
    public string Nome { get; set; } = "";
}

public record CategoriaDto(int Id, string Nome, TipoLancamento Tipo, decimal? LimiteMensal);
public record ContaDto(int Id, string Nome);

// ---------- Orçamento e Resumo ----------
public class LimiteRequest
{
    [Required] public int? CategoriaId { get; set; }
    [Range(0, 999999999.99, ErrorMessage = "O limite não pode ser negativo.")] public decimal? Limite { get; set; }
}

public record OrcamentoItemDto(int CategoriaId, string Categoria, decimal Limite, decimal Realizado, decimal Disponivel, decimal Percentual);
public record DespesaCategoriaDto(string Categoria, decimal Realizado);

public record ResumoDto(
    decimal ReceitasRecebidas, decimal DespesasPagas, decimal SaldoRealizado,
    decimal ReceitasPendentes, decimal DespesasPendentes, decimal SaldoPrevisto,
    List<DespesaCategoriaDto> DespesasPorCategoria);
