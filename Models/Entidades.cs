using Microsoft.AspNetCore.Identity;

namespace ControleFinanceiro.Models;

public enum TipoLancamento { Receita = 1, Despesa = 2 }

/// <summary>"Pago/Recebido" e "Pendente" da aba Listas da planilha.</summary>
public enum StatusLancamento { Pendente = 1, PagoRecebido = 2 }

public class ApplicationUser : IdentityUser
{
    public string NomeCompleto { get; set; } = string.Empty;
}

/// <summary>Aba "Listas" (categorias) + coluna "Limite mensal" da aba "Orçamento".</summary>
public class Categoria
{
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string Nome { get; set; } = string.Empty;
    public TipoLancamento Tipo { get; set; }
    public decimal? LimiteMensal { get; set; }
}

/// <summary>Aba "Listas" (contas).</summary>
public class Conta
{
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string Nome { get; set; } = string.Empty;
}

/// <summary>Aba "Lançamentos". O "Mês" da planilha é derivado de Data.</summary>
public class Lancamento
{
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public DateOnly Data { get; set; }
    public TipoLancamento Tipo { get; set; }
    public int CategoriaId { get; set; }
    public Categoria Categoria { get; set; } = null!;
    public string Descricao { get; set; } = string.Empty;
    public int ContaId { get; set; }
    public Conta Conta { get; set; } = null!;
    public decimal Valor { get; set; }
    public StatusLancamento Status { get; set; }
    public DateTime CriadoEm { get; set; } = DateTime.UtcNow;
}
