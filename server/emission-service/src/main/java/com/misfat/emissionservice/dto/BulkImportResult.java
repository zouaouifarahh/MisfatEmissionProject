package com.misfat.emissionservice.dto;

import java.util.List;

/**
 * Bilan d'un import en masse : mesures persistées, lignes écartées et motifs.
 *
 * <p>Une ligne est écartée lorsqu'aucun facteur d'émission ne peut être résolu
 * ou que la conversion de devise est impossible : {@code emission_factor_id}
 * étant NOT NULL, elle ne peut pas être enregistrée en base.</p>
 */
public record BulkImportResult(int importedCount, int skippedCount, List<String> skippedReasons) {

    public boolean estComplet() {
        return skippedCount == 0;
    }

    public boolean estVide() {
        return importedCount == 0;
    }
}
