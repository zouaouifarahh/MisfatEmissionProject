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
    private String gasName;

    @Column(name = "factor_value_tnd", nullable = false, precision = 16, scale = 10)
    private BigDecimal factorValueTnd;

    @Column(name = "factor_value_eur", nullable = false, precision = 16, scale = 10)
    private BigDecimal factorValueEur;
}