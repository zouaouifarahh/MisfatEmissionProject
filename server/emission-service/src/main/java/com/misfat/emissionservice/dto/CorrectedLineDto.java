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

    /**
     * Site de la mesure. Facultatif : une ligne de classeur comptable n'en
     * désigne aucun tant que l'utilisateur consulte une société entière.
     */
    private Long usineId;

    /**
     * Société de la mesure, transmise telle quelle par l'écran.
     *
     * <p>Elle était auparavant déduite de {@link #usineId}, que l'écran
     * d'import remplissait avec un identifiant de <em>société</em>. Les deux
     * séries se recouvrent : la société 2 était lue comme l'usine 2, laquelle
     * appartient à la société 1. Tout ce qui était corrigé depuis MISFAT MAROC,
     * SOLAUFIL FRANCE ou SOLAUFIL TUNISIE finissait au bilan de MISFAT
     * TUNISIE.</p>
     *
     * <p>Une société transmise prime donc sur la déduction par le site ; celle-ci
     * ne sert plus que lorsqu'un site est réellement désigné et qu'aucune
     * société ne l'accompagne.</p>
     */
    private Long filialeId;

    private Long importLogId;
}
