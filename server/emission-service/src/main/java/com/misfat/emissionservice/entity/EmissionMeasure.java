package com.misfat.emissionservice.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "emission_measure")
@Data
public class EmissionMeasure {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, precision = 18, scale = 4)
    private BigDecimal quantity;

    @Column(name = "measure_date", nullable = false)
    private LocalDate measureDate;

    @Column(name = "total_co2e", nullable = false, precision = 18, scale = 6)
    private BigDecimal totalCo2e;

    // Association physique : clé étrangère vers emission_factor
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "emission_factor_id", nullable = false)
    private EmissionFactor emissionFactor;

    // ---------- TRAÇABILITÉ DE L'ORIGINE ----------
    // Colonnes nullables à dessein : ddl-auto=update ne peut pas ajouter une
    // colonne NOT NULL à une table déjà peuplée. Les mesures antérieures
    // conservent donc origin = null, interprété comme une saisie manuelle.

    @Enumerated(EnumType.STRING)
    @Column(name = "origin", length = 20)
    private MeasureOrigin origin;

    /** Session d'import d'où provient la mesure ; null pour une saisie manuelle. */
    @Column(name = "import_log_id")
    private Long importLogId;

    /** Code du type de source d'import, ex. {@code ACHAT_BIENS}. */
    @Column(name = "source_code", length = 60)
    private String sourceCode;

    /** Code de catégorie porté par le fichier d'origine. */
    @Column(name = "category_code", length = 150)
    private String categoryCode;

    /**
     * Usine à laquelle la mesure se rattache.
     *
     * <p>Source de vérité du rattachement organisationnel : la filiale s'en
     * déduit par la clé étrangère {@code usine.filiale_id}. Le champ
     * {@link #filialeId} n'en est plus qu'une copie, tenue à jour à
     * l'enregistrement pour que les agrégats restent lisibles sans jointure.</p>
     */
    @Column(name = "usine_id")
    private Long usineId;

    @Column(name = "filiale_id")
    private Long filialeId;

    /** Unité de la quantité telle que lue : kg, L, kWh, ou un code devise. */
    @Column(name = "unit", length = 20)
    private String unit;

    /** Devise d'origine avant conversion, pour un facteur monétaire. */
    @Column(name = "currency", length = 10)
    private String currency;

    /** Libellé lu dans le fichier, utile pour rapprocher la mesure de sa source. */
    @Column(name = "label", length = 300)
    private String label;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        if (this.origin == null) {
            this.origin = MeasureOrigin.MANUAL_ENTRY;
        }
    }
}