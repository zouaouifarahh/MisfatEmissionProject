package com.misfat.emissionservice.entity;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import lombok.Data;
import java.math.BigDecimal;

@Entity
@Table(name = "gas_emission_detail")
@Data
public class GasEmissionDetail {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "emission_factor_id", nullable = false)
    @JsonBackReference
    private EmissionFactor emissionFactor;

    @Column(name = "gas_name", nullable = false)
    private String gasName; // Exemple: 'CO2', 'CH4', 'N2O'

    // Remplacement des deux colonnes EUR/TND par une seule colonne de valeur propre au facteur parent
    @Column(name = "factor_value", nullable = false, precision = 18, scale = 10)
    private BigDecimal factorValue;
}