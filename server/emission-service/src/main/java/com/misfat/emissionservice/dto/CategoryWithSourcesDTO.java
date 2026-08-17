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
            String validityLabel
    ) {
    }
}
