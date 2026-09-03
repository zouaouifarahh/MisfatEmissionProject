package com.misfat.emissionservice.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Page de mesures, et les totaux du périmètre qu'elle découpe.
 *
 * <p>Les deux voyagent ensemble à dessein. Les indicateurs du haut d'écran ne
 * se déduisent pas de la page affichée — cinquante lignes sur cent onze mille
 * n'en disent rien — et les demander par un second appel les exposerait à
 * répondre sur un périmètre qui a changé entre-temps. Un en-tête et un tableau
 * qui se contredisent sont plus coûteux qu'une requête de plus.</p>
 *
 * @param lignes        les mesures de la page demandée
 * @param page          index de la page, à partir de zéro
 * @param taille        nombre de lignes par page
 * @param totalLignes   nombre de mesures du périmètre, toutes pages confondues
 * @param totalPages    nombre de pages du périmètre
 * @param totalCo2eKg   émissions du périmètre, en kgCO₂e
 * @param totalQuantite somme des quantités du périmètre, dans leurs unités
 */
public record PageMesuresDto(
        List<MesurePageDto> lignes,
        int page,
        int taille,
        long totalLignes,
        int totalPages,
        BigDecimal totalCo2eKg,
        BigDecimal totalQuantite) {
}
