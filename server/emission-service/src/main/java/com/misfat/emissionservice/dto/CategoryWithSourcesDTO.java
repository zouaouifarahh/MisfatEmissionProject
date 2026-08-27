package com.misfat.emissionservice.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Vue destinée aux écrans de saisie Angular : une catégorie et ses sources, chaque
 * source portant déjà son unité et son facteur par défaut.
 *
 * <p>Un seul appel suffit pour alimenter les listes déroulantes en cascade
 * scope → catégorie → source, puis afficher l'unité en lecture seule.</p>
 */
public record CategoryWithSourcesDTO(
        Long categoryId,
        String categoryName,
        String scopeCode,
        String scopeLabel,
        List<SourceOptionDTO> sources
) {

    /** Source sélectionnable, avec son unité imposée et son facteur applicable. */
    public record SourceOptionDTO(
            Long carbonReferenceId,
            String referenceCode,
            String typeName,
            String unit,
            Long defaultFactorId,
            BigDecimal defaultFactorValue,
            String dataType,
            String currency,
            String databaseSource,
            Integer referenceYear,
            BigDecimal uncertaintyPercent,
            /** Validité telle que publiée : « Current » ou « From 2024-01-01 ». */
            String validityLabel,

            /**
             * Tous les facteurs rattachés à cette source, le plus récent en tête.
             *
             * <p>Les champs {@code default*} ci-dessus n'en désignent qu'un seul :
             * celui que la saisie applique tant que l'utilisateur ne tranche pas.
             * Ils suffisaient tant qu'une référence ne portait qu'un facteur, mais
             * une même source est documentée par plusieurs bases — l'EPA, l'ADEME,
             * l'IPCC — avec des valeurs distinctes, et un ajout manuel en crée une
             * de plus. Ne renvoyer que le premier faisait croire que le nouveau
             * facteur avait écrasé l'ancien, alors que les deux étaient bien en
             * base : c'est la vue qui les cachait, pas l'enregistrement.</p>
             */
            List<VarianteFacteurDTO> variantes
    ) {
    }

    /** Un facteur applicable à une source, tel que la saisie peut le retenir. */
    public record VarianteFacteurDTO(
            Long factorId,
            BigDecimal factorValue,
            String unit,
            String dataType,
            String currency,
            String databaseSource,
            Integer referenceYear,
            BigDecimal uncertaintyPercent,
            String validityLabel
    ) {
    }
}
