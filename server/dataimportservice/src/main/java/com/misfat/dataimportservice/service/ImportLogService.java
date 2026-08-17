package com.misfat.dataimportservice.service;

import com.misfat.dataimportservice.dto.ImportLogDTO;

import java.util.List;

/** Suivi du cycle de vie des imports Excel. */
public interface ImportLogService {

    /**
     * Ouvre un log au démarrage d'un import : horodate et positionne le statut à
     * {@code IN_PROGRESS}.
     */
    ImportLogDTO startImport(ImportLogDTO dto);

    /**
     * Clôture un log avec la volumétrie constatée. Le statut final est déduit :
     * aucune erreur → {@code SUCCESS}, aucun succès → {@code FAILED}, sinon
     * {@code PARTIAL_SUCCESS}.
     */
    ImportLogDTO completeImport(Long id, Integer totalLinesProcessed, Integer successCount, Integer errorCount);

    /** Clôture en échec, sans volumétrie exploitable (fichier illisible, etc.). */
    ImportLogDTO failImport(Long id);

    ImportLogDTO findById(Long id);

    List<ImportLogDTO> findAll();

    List<ImportLogDTO> findByFiliale(Long filialeId);

    List<ImportLogDTO> findByFilialeAndUsine(Long filialeId, Long usineId);

    List<ImportLogDTO> findBySourceType(Long importSourceTypeId);
}
