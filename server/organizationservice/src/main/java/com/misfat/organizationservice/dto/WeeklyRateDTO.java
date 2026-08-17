package com.misfat.organizationservice.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Cours hebdomadaire d'une devise, tel qu'affiché par le bandeau du tableau
 * de bord.
 *
 * <p>{@code rate} se lit « 1 {@code code} = rate TND ». La variation compare le
 * cours retenu pour la semaine à celui de la semaine précédente ; elle vaut
 * {@code null} quand l'historique ne remonte pas assez loin, cas où le bandeau
 * n'affiche aucune puce plutôt qu'une variation nulle trompeuse.</p>
 *
 * @param rate              cours retenu pour la semaine courante
 * @param previousRate      cours de clôture de la semaine précédente
 * @param variationPercent  variation en pourcentage, arrondie au centième
 * @param rateDate          date de prise d'effet du cours retenu
 */
public record WeeklyRateDTO(
        String code,
        String label,
        BigDecimal rate,
        BigDecimal previousRate,
        BigDecimal variationPercent,
        LocalDate rateDate,
        LocalDate weekStart,
        LocalDate weekEnd,
        int weekNumber) {
}
