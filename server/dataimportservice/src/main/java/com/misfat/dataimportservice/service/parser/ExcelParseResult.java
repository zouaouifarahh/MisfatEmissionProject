package com.misfat.dataimportservice.service.parser;

import com.misfat.dataimportservice.dto.RawImportRowDto;

import java.util.List;

/**
 * Résultat complet d'une lecture : lignes exploitables, volumétrie et rejets.
 *
 * <p>{@code totalDataRows} compte les <strong>enregistrements</strong> extraits,
 * pas les lignes physiques du fichier, et vérifie toujours
 * {@code totalDataRows == successCount + errorCount}. Pour un fichier ligne par
 * ligne les deux notions coïncident ; pour une matrice mensuelle, une ligne
 * source produit autant d'enregistrements que de mois renseignés. L'en-tête et
 * les lignes vides sont exclus.</p>
 */
public record ExcelParseResult(
        List<RawImportRowDto> rows,
        int totalDataRows,
        List<RowError> errors
) {

    public int successCount() {
        return rows.size();
    }

    public int errorCount() {
        return errors.size();
    }
}
