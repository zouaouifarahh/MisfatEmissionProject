package com.misfat.emissionservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Ligne d'activité brute reçue de {@code data-import-service}.
 *
 * <p>Copie volontaire du DTO émetteur : les deux microservices n'ont pas de
 * module commun, le contrat est donc dupliqué de part et d'autre. Toute
 * évolution doit être appliquée dans les deux.</p>
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RawImportRowDto {

    private LocalDate dateDocument;
    private String label;
    private BigDecimal rawAmount;

    /** Renseignée pour un montant, nulle pour une quantité physique. */
    private String rawCurrency;

    private String categoryCode;
    private String sourceCode;
    private Long filialeId;
    private String unit;
    private Integer sourceRowNumber;
}
