package com.misfat.dataimportservice.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Modèle de fichier Excel supporté par la plateforme (Base Achat, Base
 * Investissement, Base Déchets, Factures Énergie...).
 */
@Entity
@Table(
        name = "import_source_type",
        uniqueConstraints = @UniqueConstraint(name = "uk_import_source_type_code", columnNames = "code_name")
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ImportSourceType {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Identifiant technique stable, ex. {@code ACHAT_BIENS}, {@code STEG_ENERGIE}. */
    @Column(name = "code_name", nullable = false, unique = true, length = 60)
    private String codeName;

    /** Libellé présenté à l'utilisateur, ex. « Base Achat ». */
    @Column(name = "display_name", nullable = false, length = 120)
    private String displayName;

    /** Scope GHG visé : {@code SCOPE_1}, {@code SCOPE_2} ou {@code SCOPE_3}. */
    @Column(name = "scope_target", nullable = false, length = 20)
    private String scopeTarget;

    /** Catégorie GHG visée, ex. « Cat. 1 - Achats de biens ». */
    @Column(name = "category_target", nullable = false, length = 150)
    private String categoryTarget;

    @Enumerated(EnumType.STRING)
    @Column(name = "excel_structure_type", nullable = false, length = 20)
    private ExcelStructureType excelStructureType;

    /** Désactivé plutôt que supprimé : les logs d'import gardent leur référence. */
    @Column(name = "active", nullable = false)
    @Builder.Default
    private Boolean active = true;

    @PrePersist
    void applyDefaults() {
        if (active == null) {
            active = Boolean.TRUE;
        }
    }
}
