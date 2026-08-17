package com.misfat.dataimportservice.service.parser;

import com.misfat.dataimportservice.dto.RawImportRowDto;
import com.misfat.dataimportservice.entity.ExcelStructureType;

import java.io.InputStream;
import java.util.List;

/**
 * Stratégie de lecture d'un modèle de fichier Excel.
 *
 * <p>Chaque implémentation déclare la structure qu'elle sait traiter, ce qui
 * permet à {@code ExcelImportService} de choisir le parser sans {@code switch}
 * sur le type de source.</p>
 */
public interface ExcelParserStrategy {

    /** Structure de fichier prise en charge par cette stratégie. */
    ExcelStructureType supportedStructure();

    /**
     * Lecture avec conservation de la volumétrie et des rejets ligne à ligne.
     * Une ligne invalide est écartée, elle n'interrompt pas la lecture.
     *
     * @throws com.misfat.dataimportservice.exception.ExcelParsingException
     *         si le fichier lui-même est illisible (format, feuille absente).
     */
    ExcelParseResult parseDetailed(InputStream inputStream, Long filialeId);

    /** Ne renvoie que les lignes exploitables, sans le détail des rejets. */
    default List<RawImportRowDto> parse(InputStream inputStream, Long filialeId) {
        return parseDetailed(inputStream, filialeId).rows();
    }
}
