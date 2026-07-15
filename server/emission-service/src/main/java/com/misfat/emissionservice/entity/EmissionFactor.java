package com.misfat.emissionservice.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Entity
@Table(name = "emission_factor")
@Data
public class EmissionFactor {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "crop_type", nullable = false)
    private String cropType;

    @Column(name = "reference_year")
    private Integer referenceYear = 2022;

    @Column(name = "unit")
    private String unit = "kg CO2e / L";

    @Column(name = "factor_value_tnd", nullable = false, precision = 16, scale = 10)
    private BigDecimal factorValueTnd;

    @Column(name = "factor_value_eur", nullable = false, precision = 16, scale = 10)
    private BigDecimal factorValueEur;

    @Column(name = "has_margins")
    private Boolean hasMargins = true;

    @OneToMany(mappedBy = "emissionFactor", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<GasEmissionDetail> gasDetails;

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