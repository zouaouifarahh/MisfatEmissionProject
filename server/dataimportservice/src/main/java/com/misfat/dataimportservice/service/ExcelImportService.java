package com.misfat.dataimportservice.service;

import com.misfat.dataimportservice.dto.ImportResultDTO;
import org.springframework.web.multipart.MultipartFile;

/** Orchestration d'un import : journalisation, choix du parser, volumétrie. */
public interface ExcelImportService {

    /**
     * Traite un fichier de bout en bout.
     *
     * @param sourceType {@code codeName} du type de source déclaré, ex.
     *                   {@code ACHAT_BIENS} ; il détermine le parser à employer.
     * @param usineId    périmètre usine, facultatif.
     * @return le log clôturé, les lignes extraites et les rejets.
     */
    ImportResultDTO processFile(MultipartFile file, String sourceType, Long filialeId, Long usineId, String importedBy);

    /** Variante conforme à la signature de référence, sans périmètre usine ni auteur. */
    default ImportResultDTO processFile(MultipartFile file, String sourceType, Long filialeId) {
        return processFile(file, sourceType, filialeId, null, null);
    }
}
