package com.misfat.emissionservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CarbonReferenceDTO {

    private Long id;
    private String referenceCode; // Ex: MS1RG, MS1COV
    private String typeName;      // Ex: R410a emissions, Average diesel car
    private String defaultUnit;   // Ex: Kg, L, Km, kWh

    // Informations jointes de la Catégorie et du Scope
    private Long categoryId;
    private String categoryName;

    private Long scopeId;
    private String scopeCode;     // Ex: SCOPE_1, SCOPE_2
    private String scopeLabel;    // Ex: Scope 1 · Direct
}

