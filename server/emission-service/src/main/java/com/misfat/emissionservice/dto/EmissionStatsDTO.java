package com.misfat.emissionservice.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * Agrégats d'émissions du périmètre demandé, tels que consommés par le tableau
 * de bord directeur.
 *
 * <p>Toutes les valeurs sont exprimées dans {@link #unit} : tCO₂e en mode
 * physique, {@link #currency} en mode monétaire.</p>
 *
 * @param mode              {@code PHYSIQUE} ou {@code MONETAIRE}
 * @param unit              unité de restitution des valeurs
 * @param currency          devise de restitution ; null en mode physique
 * @param measureCount      nombre de mesures retenues dans le périmètre
 * @param total             somme sur l'ensemble du périmètre
 * @param scope1            raccourci de lecture pour {@code byScope[SCOPE_1]}
 * @param byScope           ventilation par scope GHG
 * @param byCategory        ventilation par catégorie d'émission
 * @param byScopeCategory   ventilation par catégorie, cloisonnée par scope, pour
 *                          les vues qui détaillent un scope isolément
 * @param byFiliale         ventilation par filiale, avec quote-part calculée
 * @param byCurrency        montants d'origine par devise ; vide en mode physique
 * @param unconvertedCurrencies devises sans taux connu, laissées telles quelles
 */
public record EmissionStatsDTO(
        String mode,
        String unit,
        String currency,
        long measureCount,
        BigDecimal total,
        BigDecimal scope1,
        BigDecimal scope2,
        BigDecimal scope3,
        Map<String, BigDecimal> byScope,
        Map<String, BigDecimal> byCategory,
        Map<String, Map<String, BigDecimal>> byScopeCategory,
        List<FilialeShare> byFiliale,
        Map<String, BigDecimal> byCurrency,
        List<String> unconvertedCurrencies) {

    /**
     * Contribution d'une filiale au total du périmètre.
     *
     * @param filialeId identifiant côté organization-service ; null si la mesure
     *                  n'est rattachée à aucune filiale
     * @param share     quote-part en pourcentage du total, prête pour le donut
     */
    public record FilialeShare(Long filialeId, BigDecimal value, BigDecimal share, long measureCount) {
    }
}
