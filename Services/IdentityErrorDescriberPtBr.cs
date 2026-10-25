using Microsoft.AspNetCore.Identity;

namespace ControleFinanceiro.Services;

public class IdentityErrorDescriberPtBr : IdentityErrorDescriber
{
    private static IdentityError E(string code, string msg) => new() { Code = code, Description = msg };

    public override IdentityError DefaultError() => E(nameof(DefaultError), "Ocorreu um erro. Tente novamente.");
    // Mensagem genérica de propósito: não confirma se um e-mail já está cadastrado.
    public override IdentityError DuplicateEmail(string email) => E(nameof(DuplicateEmail), "Não foi possível concluir o cadastro com os dados informados.");
    public override IdentityError DuplicateUserName(string userName) => E(nameof(DuplicateUserName), "Não foi possível concluir o cadastro com os dados informados.");
    public override IdentityError InvalidEmail(string? email) => E(nameof(InvalidEmail), "E-mail inválido.");
    public override IdentityError InvalidUserName(string? userName) => E(nameof(InvalidUserName), "E-mail inválido.");
    public override IdentityError PasswordMismatch() => E(nameof(PasswordMismatch), "Senha atual incorreta.");
    public override IdentityError PasswordTooShort(int length) => E(nameof(PasswordTooShort), $"A senha deve ter pelo menos {length} caracteres.");
    public override IdentityError PasswordRequiresDigit() => E(nameof(PasswordRequiresDigit), "A senha deve ter pelo menos um número.");
    public override IdentityError PasswordRequiresLower() => E(nameof(PasswordRequiresLower), "A senha deve ter pelo menos uma letra minúscula.");
    public override IdentityError PasswordRequiresUpper() => E(nameof(PasswordRequiresUpper), "A senha deve ter pelo menos uma letra maiúscula.");
    public override IdentityError PasswordRequiresNonAlphanumeric() => E(nameof(PasswordRequiresNonAlphanumeric), "A senha deve ter pelo menos um símbolo.");
    public override IdentityError PasswordRequiresUniqueChars(int uniqueChars) => E(nameof(PasswordRequiresUniqueChars), $"A senha deve ter pelo menos {uniqueChars} caracteres diferentes.");
}
