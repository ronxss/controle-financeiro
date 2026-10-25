using ControleFinanceiro.Models;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace ControleFinanceiro.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<ApplicationUser>(options)
{
    public DbSet<Categoria> Categorias => Set<Categoria>();
    public DbSet<Conta> Contas => Set<Conta>();
    public DbSet<Lancamento> Lancamentos => Set<Lancamento>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);

        b.Entity<ApplicationUser>().Property(u => u.NomeCompleto).HasMaxLength(100);

        b.Entity<Categoria>(e =>
        {
            e.Property(x => x.Nome).HasMaxLength(60).IsRequired();
            e.Property(x => x.Tipo).HasConversion<string>().HasMaxLength(10);
            e.Property(x => x.LimiteMensal).HasPrecision(18, 2);
            e.HasIndex(x => new { x.UserId, x.Nome }).IsUnique();
            e.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Conta>(e =>
        {
            e.Property(x => x.Nome).HasMaxLength(60).IsRequired();
            e.HasIndex(x => new { x.UserId, x.Nome }).IsUnique();
            e.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Lancamento>(e =>
        {
            e.ToTable(t => t.HasCheckConstraint("CK_Lancamento_Valor", "[Valor] > 0"));
            e.Property(x => x.Descricao).HasMaxLength(200).IsRequired();
            e.Property(x => x.Valor).HasPrecision(18, 2);
            e.Property(x => x.Tipo).HasConversion<string>().HasMaxLength(10);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
            e.HasIndex(x => new { x.UserId, x.Data });
            e.HasOne(x => x.Categoria).WithMany().HasForeignKey(x => x.CategoriaId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Conta).WithMany().HasForeignKey(x => x.ContaId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
