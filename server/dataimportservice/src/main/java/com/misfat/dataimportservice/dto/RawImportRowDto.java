package com.misfat.dataimportservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Ligne brute extraite d'un fichier Excel, avant tout calcul d'émission.
 *
 * <p>Volontairement sans logique métier : les parsers se contentent de lire et
 * de normaliser, le calcul du facteur d'émission relève d'{@code emission-service}.</p>
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RawImportRowDto {

    /** Date du document (facture, écriture comptable, période de pesée). */
    private LocalDate dateDocument;

    /** Libellé lu dans le fichier (désignation d'achat, type de déchet...). */
    private String label;

    /** Montant ou quantité, tel que lu, sans conversion. */
    private BigDecimal rawAmount;

    /** Devise du montant : TND, MAD, EUR... Vide pour une quantité physique. */
    private String rawCurrency;

    /** Code de catégorie GHG visée, ex. {@code CAT_1}, {@code CAT_5}. */
    private String categoryCode;

    /** Code du type de source d'import ayant produit la ligne. */
    private String sourceCode;

    private Long filialeId;

    /** Unité de la valeur : kg, t, kWh, L, ou le code devise pour un montant. */
    private String unit;

    /**
     * Numéro de ligne (1-based) dans la feuille d'origine. Hors spécification
     * mais indispensable pour rattacher une erreur à sa ligne.
     */
    private Integer sourceRowNumber;
}
