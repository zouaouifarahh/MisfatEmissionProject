package com.misfat.emissionservice.controller;

import com.misfat.emissionservice.dto.CarbonReferenceDTO;
import com.misfat.emissionservice.entity.Category;
import com.misfat.emissionservice.entity.Scope;
import com.misfat.emissionservice.repository.CategoryRepository;
import com.misfat.emissionservice.repository.ScopeRepository;
import com.misfat.emissionservice.service.CarbonReferenceService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/referentiel-carbone")
@CrossOrigin(origins = "http://localhost:4200") // Permet les requêtes depuis Angular
@RequiredArgsConstructor
public class CarbonReferenceController {

    private final CarbonReferenceService carbonReferenceService;
    private final ScopeRepository scopeRepository;
    private final CategoryRepository categoryRepository;

    // --- 1. AFFICHER TOUTES LES RÉFÉRENCES (OU FILTRÉES PAR SCOPE) ---
    @GetMapping
    public ResponseEntity<List<CarbonReferenceDTO>> getAllReferences(
            @RequestParam(required = false) Long scopeId) {

        if (scopeId != null) {
            return ResponseEntity.ok(carbonReferenceService.getReferencesByScope(scopeId));
        }
        return ResponseEntity.ok(carbonReferenceService.getAllReferences());
    }

    // --- 2. OBTENIR UNE RÉFÉRENCE PAR SON ID ---
    @GetMapping("/{id}")
    public ResponseEntity<CarbonReferenceDTO> getReferenceById(@PathVariable Long id) {
        return ResponseEntity.ok(carbonReferenceService.getReferenceById(id));
    }

    // --- 3. AJOUTER UNE NOUVELLE RÉFÉRENCE ---
    @PostMapping
    public ResponseEntity<CarbonReferenceDTO> createReference(@RequestBody CarbonReferenceDTO dto) {
        CarbonReferenceDTO created = carbonReferenceService.saveReference(dto);
        return new ResponseEntity<>(created, HttpStatus.CREATED);
    }

    // --- 4. MODIFIER UNE RÉFÉRENCE EXISTANTE ---
    @PutMapping("/{id}")
    public ResponseEntity<CarbonReferenceDTO> updateReference(
            @PathVariable Long id,
            @RequestBody CarbonReferenceDTO dto) {

        dto.setId(id);
        CarbonReferenceDTO updated = carbonReferenceService.saveReference(dto);
        return ResponseEntity.ok(updated);
    }

    // --- 5. SUPPRIMER UNE RÉFÉRENCE ---
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteReference(@PathVariable Long id) {
        carbonReferenceService.deleteReference(id);
        return ResponseEntity.noContent().build();
    }

    // =========================================================================
    // --- 6. ENDPOINTS D'AIDE POUR L'INTERFACE (SCOPES ET CATÉGORIES) ---
    // =========================================================================

    @GetMapping("/scopes")
    public ResponseEntity<List<Scope>> getAllScopes() {
        return ResponseEntity.ok(scopeRepository.findAll());
    }

    @GetMapping("/categories")
    public ResponseEntity<List<Category>> getCategoriesByScope(
            @RequestParam(required = false) Long scopeId) {

        if (scopeId != null) {
            return ResponseEntity.ok(categoryRepository.findByScopeId(scopeId));
        }
        return ResponseEntity.ok(categoryRepository.findAll());
    }

    @GetMapping("/types")
    public ResponseEntity<List<String>> getEmissionTypes() {
        List<String> types = carbonReferenceService.getAllEmissionTypes();
        return ResponseEntity.ok(types);
    }
}