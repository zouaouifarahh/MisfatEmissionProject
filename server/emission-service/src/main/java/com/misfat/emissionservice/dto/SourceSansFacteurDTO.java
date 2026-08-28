package com.misfat.emissionservice.dto;

/**
 * Source d'émission qu'aucun facteur ne documente.
 *
 * <p>Deux tables décrivent une source. {@code ref_carbon_references} porte le
 * référentiel carbone — c'est elle que les facteurs référencent. {@code
 * ref_emission_sources} porte les sources déclarées depuis l'écran « Sources
 * d'Émission ». Les deux se rejoignent par le code de référence, mais rien ne
 * les tenait synchronisées : une source créée à l'écran n'obtenait aucune
 * référence carbone, donc ne pouvait recevoir aucun facteur, donc
 * n'apparaissait nulle part. Elle était perdue au moment même de sa
 * création.</p>
 *
 * <p>Ce DTO réunit les deux manques sous une seule forme : la référence connue
 * du référentiel mais dépourvue de facteur, et la source déclarée que le
 * référentiel ignore.</p>
 */
public record SourceSansFacteurDTO(
        String referenceCode,
        String typeName,
        String categoryName,
        String scopeCode,
        String defaultUnit,

        /**
         * Référence carbone correspondante ; {@code null} quand la source n'en a
         * pas encore.
         *
         * <p>L'écran s'en sert pour savoir s'il peut créer un facteur
         * directement ou s'il faut d'abord rattacher la source au
         * référentiel.</p>
         */
        Long carbonReferenceId
) {
}
