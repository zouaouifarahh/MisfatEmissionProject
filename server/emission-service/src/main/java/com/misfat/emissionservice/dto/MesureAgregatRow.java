package com.misfat.emissionservice.dto;

import java.math.BigDecimal;

/**
 * Ligne d'agrégat renvoyée par le {@code GROUP BY} sur {@code emission_measure}.
 *
 * <p>La somme est calculée par MSSQL : la table de mesures peut être volumineuse,
 * alors que le résultat groupé tient en quelques dizaines de lignes. Les axes de
 * regroupement (scope, catégorie, filiale, devise, type de facteur, année) sont
 * tous portés par la même requête, ce qui permet ensuite de dériver n'importe
 * quelle vue du tableau de bord sans repasser par la base.</p>
 */
public interface MesureAgregatRow {

    /** {@code SCOPE_1}…{@code SCOPE_3} ; null si la mesure n'est pas classée. */
    String getScopeCode();

    /** Libellé de catégorie GHG ; null si la mesure n'est pas catégorisée. */
    String getCategorieNom();

    /** Filiale d'imputation ; null pour une mesure non affectée. */
    Long getFilialeId();

    /** Devise d'origine du montant, pour un facteur monétaire. */
    String getDevise();

    /** {@code PHYSIQUE} ou {@code MONETAIRE}, porté par le facteur. */
    String getTypeDonnee();

    Integer getAnnee();

    /** Somme des émissions en kg CO₂e. */
    BigDecimal getSommeCo2e();

    /** Somme des quantités dans l'unité d'origine (litres, kWh, montant…). */
    BigDecimal getSommeQuantite();

    Long getNombre();
}
