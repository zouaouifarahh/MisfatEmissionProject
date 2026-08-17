package com.misfat.emissionservice.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "emission_factor")
@Data
public class EmissionFactor {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // --- NOUVELLE ASSOCIATION : Liaison directe avec le Référentiel Carbone ---
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "carbon_reference_id", nullable = false)
    private CarbonReference carbonReference;

    @Column(name = "data_type", nullable = false)
    private String dataType; // 'PHYSIQUE' ou 'MONETAIRE'

    @Column(name = "database_source", nullable = false)
    private String databaseSource; // 'EPA_USA', 'ECOINVENT', 'UK_DEFRA', 'MISFAT_INTERNE'

    @Column(name = "factor_value", nullable = false, precision = 18, scale = 10)
    private BigDecimal factorValue; // Valeur du facteur kg CO2e

    @Column(nullable = false)
    private String unit; // ex: 'L', 'Tonnes', 'kWh', 'EUR', 'TND'

    @Column(nullable = true)
    private String currency; // 'TND' ou 'EUR' (uniquement si dataType = 'MONETAIRE')

    @Column(name = "reference_year")
    private Integer referenceYear = 2024;

    /** Incertitude en pourcentage telle que publiée par la source (colonne « Incertitude »). */
    @Column(name = "uncertainty_percent", precision = 8, scale = 2)
    private BigDecimal uncertaintyPercent;

    /** Validité du facteur : « Current » ou « From 2024-01-01 » dans le fichier source. */
    @Column(name = "validity_label", length = 40)
    private String validityLabel;

    @Column(name = "has_margins")
    private Boolean hasMargins = true;

    @OneToMany(mappedBy = "emissionFactor", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<GasEmissionDetail> gasDetails = new ArrayList<>();

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}