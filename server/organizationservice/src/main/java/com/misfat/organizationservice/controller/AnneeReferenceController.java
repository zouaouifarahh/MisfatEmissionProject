package com.misfat.organizationservice.controller;

import com.misfat.organizationservice.dto.AnneeReferenceDTO;
import com.misfat.organizationservice.service.AnneeReferenceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/** Exercices carbone : ouverture, clôture et réouverture. */
@RestController
@RequestMapping("/api/annees")
public class AnneeReferenceController {

    @Autowired
    private AnneeReferenceService anneeReferenceService;

    @GetMapping
    public List<AnneeReferenceDTO> getAll() {
        return anneeReferenceService.getAllAnnees();
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody AnneeReferenceDTO dto) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED).body(anneeReferenceService.createAnnee(dto));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @PutMapping("/{id}/cloturer")
    public ResponseEntity<?> cloturer(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(anneeReferenceService.cloturerAnnee(id));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PutMapping("/{id}/rouvrir")
    public ResponseEntity<?> rouvrir(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(anneeReferenceService.rouvrirAnnee(id));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id) {
        try {
            anneeReferenceService.supprimerAnnee(id);
            return ResponseEntity.noContent().build();
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
