package com.misfat.dataimportservice.controller;

import com.misfat.dataimportservice.dto.ImportLogDTO;
import com.misfat.dataimportservice.service.ImportLogService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/import-logs")
@RequiredArgsConstructor
public class ImportLogController {

    private final ImportLogService service;

    /**
     * Historique complet, ou filtré par filiale via {@code ?filialeId=} et
     * éventuellement {@code &usineId=}. Toujours trié du plus récent au plus ancien.
     */
    @GetMapping
    public List<ImportLogDTO> getAll(
            @RequestParam(name = "filialeId", required = false) Long filialeId,
            @RequestParam(name = "usineId", required = false) Long usineId) {

        if (filialeId == null) {
            return service.findAll();
        }
        return usineId == null
                ? service.findByFiliale(filialeId)
                : service.findByFilialeAndUsine(filialeId, usineId);
    }

    @GetMapping("/filiale/{filialeId}")
    public List<ImportLogDTO> getByFiliale(@PathVariable Long filialeId) {
        return service.findByFiliale(filialeId);
    }

    @GetMapping("/filiale/{filialeId}/usine/{usineId}")
    public List<ImportLogDTO> getByFilialeAndUsine(@PathVariable Long filialeId, @PathVariable Long usineId) {
        return service.findByFilialeAndUsine(filialeId, usineId);
    }

    @GetMapping("/source/{importSourceTypeId}")
    public List<ImportLogDTO> getBySourceType(@PathVariable Long importSourceTypeId) {
        return service.findBySourceType(importSourceTypeId);
    }

    @GetMapping("/{id}")
    public ImportLogDTO getById(@PathVariable Long id) {
        return service.findById(id);
    }

    /** Ouvre un log au démarrage d'un import (statut {@code IN_PROGRESS}). */
    @PostMapping
    public ResponseEntity<ImportLogDTO> start(@Valid @RequestBody ImportLogDTO dto) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.startImport(dto));
    }

    /** Clôture le log : le statut final est déduit de la volumétrie transmise. */
    @PatchMapping("/{id}/complete")
    public ImportLogDTO complete(
            @PathVariable Long id,
            @RequestParam(name = "totalLinesProcessed") Integer totalLinesProcessed,
            @RequestParam(name = "successCount") Integer successCount,
            @RequestParam(name = "errorCount") Integer errorCount) {
        return service.completeImport(id, totalLinesProcessed, successCount, errorCount);
    }

    @PatchMapping("/{id}/fail")
    public ImportLogDTO fail(@PathVariable Long id) {
        return service.failImport(id);
    }
}
