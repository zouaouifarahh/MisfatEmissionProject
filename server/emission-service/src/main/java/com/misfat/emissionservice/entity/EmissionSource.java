package com.misfat.emissionservice.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "ref_emission_sources")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class EmissionSource {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "reference_code", nullable = false, unique = true)
    private String referenceCode; // Ex: MS1COV

    @Column(nullable = false)
    private String scope; // SCOPE_1, SCOPE_2, SCOPE_3

    @Column(nullable = false)
    private String category; // Ex: Combustion des véhicules

    @Column(name = "source_name", nullable = false)
    private String sourceName; // Ex: Voiture à diesel moyenne

    @Column(name = "default_unit", nullable = false)
    private String defaultUnit; // L, kg, Km, kWh
}