package com.misfat.emissionservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Ligne d'import corrigée à l'écran, puis validée par l'utilisateur.
 *
 * <p>Elle se distingue d'une {@link RawImportRowDto} sur un point : son facteur
 * a été arbitré à la main. Une ligne tombée sur un repli ADEME, ou dépourvue de
 * catégorie carbone, ne pouvait être valorisée qu'approximativement ; l'écran de
 * correction laisse l'utilisateur trancher, et c'est ce choix qui doit être
 * enregistré — non le facteur que le référentiel aurait proposé de lui-même.</p>
 *
 * <p>Le {@link #factor} corrigé prime donc sur celui du facteur d'émission
 * rattaché. Ce dernier reste nécessaire : {@code emission_factor_id} est NOT
 * NULL en base, et la mesure doit rester rattachable au référentiel pour la
 * traçabilité du calcul.</p>
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CorrectedLineDto {

    /**
     * Clé de la ligne dans le magasin de répartition du navigateur.
     *
     * <p>Restituée telle quelle dans le compte rendu, elle permet à l'écran de
     * savoir quelles lignes ont effectivement été enregistrées et de ne pas les
     * renvoyer à la validation suivante. Elle n'est pas persistée : la base ne
     * porte pas de colonne pour un identifiant propre au navigateur.</p>
     */
    private String cle;

    private LocalDate measureDate;
    private String label;
    private BigDecimal quantity;

    /** Facteur retenu par l'utilisateur, en kgCO₂e par unité de quantité. */
    private BigDecimal factor;

    /** Renseignée pour un montant, nulle pour une quantité physique. */
    private String rawCurrency;

    private String unit;

    /** Catégorie carbone après correction, si l'utilisateur l'a renseignée. */
    private String categoryCode;

    /** Code du référentiel qui a désigné le facteur, quand il y en a un. */
    private String sourceCode;

    private Long usineId;
    private Long importLogId;
}
