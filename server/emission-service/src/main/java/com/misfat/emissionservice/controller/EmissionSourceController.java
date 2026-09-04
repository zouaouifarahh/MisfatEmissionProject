package com.misfat.emissionservice.controller;

import com.misfat.emissionservice.entity.EmissionSource;
import com.misfat.emissionservice.service.EmissionSourceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/emission-sources")
@CrossOrigin(origins = "*") // À ajuster selon ton CORS Angular
public class EmissionSourceController {

    @Autowired
    private EmissionSourceService service;

    @GetMapping
    public List<EmissionSource> getAllSources() {
        return service.getAllSources();
    }

    @GetMapping("/category/{category}")
    public List<EmissionSource> getSourcesByCategory(@PathVariable String category) {
        return service.getSourcesByCategory(category);
    }

    /**
     * Message rendu à l'écran quand le code est déjà pris.
     *
     * <p>Le corps est explicite plutôt que laissé au format d'erreur par défaut
     * de Spring : {@code server.error.include-message} n'est pas activé, et la
     * réponse standard arriverait au navigateur sans son motif. L'écran lit
     * {@code error.message}, il faut donc l'écrire.</p>
     */
    private static final String REFERENCE_EN_DOUBLE =
            "⚠️ Cette référence existe déjà dans le référentiel.";

    @PostMapping
    public ResponseEntity<?> createSource(@RequestBody EmissionSource source) {
        if (service.referenceDejaPrise(source.getReferenceCode(), null)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", REFERENCE_EN_DOUBLE));
        }
        return ResponseEntity.ok(service.saveSource(source));
    }

    /** Modification depuis l'icône ✏️ du référentiel des sources. */
    @PutMapping("/{id}")
    public ResponseEntity<?> updateSource(@PathVariable Long id,
                                          @RequestBody EmissionSource source) {
        // La source garde son propre code sans se déclarer en conflit avec
        // elle-même : seul un code déjà porté par une autre ligne est refusé.
        if (service.referenceDejaPrise(source.getReferenceCode(), id)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", REFERENCE_EN_DOUBLE));
        }

        try {
            return ResponseEntity.ok(service.updateSource(id, source));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{id}")
    public void deleteSource(@PathVariable Long id) {
        service.deleteSource(id);
    }
}