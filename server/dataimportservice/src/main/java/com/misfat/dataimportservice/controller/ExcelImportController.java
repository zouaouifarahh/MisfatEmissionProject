package com.misfat.dataimportservice.controller;

import com.misfat.dataimportservice.dto.ImportResultDTO;
import com.misfat.dataimportservice.service.ExcelImportService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

/**
 * Dépôt de fichiers Excel. Hors périmètre strict de la demande, mais nécessaire
 * pour que le moteur ETL soit atteignable et testable de bout en bout.
 */
@RestController
@RequestMapping("/api/v1/imports")
@RequiredArgsConstructor
public class ExcelImportController {

    private final ExcelImportService excelImportService;

    @PostMapping(consumes = "multipart/form-data")
    public ImportResultDTO upload(
            @RequestPart("file") MultipartFile file,
            @RequestParam("sourceType") String sourceType,
            @RequestParam("filialeId") Long filialeId,
            @RequestParam(name = "usineId", required = false) Long usineId,
            @RequestParam(name = "importedBy", required = false) String importedBy) {

        return excelImportService.processFile(file, sourceType, filialeId, usineId, importedBy);
    }
}
