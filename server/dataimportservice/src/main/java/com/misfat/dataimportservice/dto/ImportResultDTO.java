package com.misfat.dataimportservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Retour d'un traitement de fichier : le log persisté, les lignes extraites et
 * les rejets.
 *
 * <p>Les lignes sont renvoyées et non stockées : la table des données d'activité
 * appartient à {@code emission-service}, ce service se limite à l'extraction.</p>
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ImportResultDTO {

    private ImportLogDTO log;

    /** Lignes exploitables, prêtes à être transmises au calcul d'émissions. */
    private List<RawImportRowDto> rows;

    /** Rejets formatés « ligne N : motif ». */
    private List<String> errors;
}
