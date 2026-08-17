package com.misfat.emissionservice.entity;


import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "ref_carbon_references")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
public class CarbonReference {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "reference_code", nullable = false, unique = true)
    private String referenceCode; // Ex: MS1RG, MS1COC, MS1COV, MS2ENDI

    @Column(name = "type_name", nullable = false)
    private String typeName; // Ex: R410a emissions, Average diesel car

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "category_id", nullable = false)
    private Category category;

    @Column(name = "default_unit")
    private String defaultUnit; // Kg, L, Km, kWh
}