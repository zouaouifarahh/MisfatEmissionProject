package com.misfat.emissionservice.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Mesure telle qu'un tableau de saisie l'affiche.
 *
 * <p>Une projection, et non l'entité : celle-ci embarque son facteur, sa
 * référence carbone, sa catégorie et son scope, soit quatre jointures et
 * quelques centaines d'octets par ligne. Sur une page de cent lignes le coût
 * reste modeste ; sur les cent onze mille lignes d'un exercice d'achats, il
 * décide de la tenue du navigateur — et c'est précisément ce volume que cette
 * lecture doit servir.</p>
 *
 * <p>Les champs retenus sont ceux que le tableau montre, plus ceux dont la
 * vérification a besoin : le facteur appliqué et sa base documentaire, sans
 * lesquels une ligne ne se justifie pas.</p>
 */
public record MesurePageDto(
        Long id,
        String label,
        BigDecimal quantity,
        String unit,
        String currency,
        BigDecimal totalCo2e,
        LocalDate measureDate,
        String origin,
        Long filialeId,
        Long usineId,
        /** Référence carbone qui a désigné le facteur, ou null si la mesure n'en porte pas. */
        String referenceCode,
        BigDecimal factorValue,
        String factorUnit,
        String dataType,
        String databaseSource,
        String categoryName) {
}
