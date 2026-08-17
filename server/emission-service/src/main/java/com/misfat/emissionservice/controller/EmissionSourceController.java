package com.misfat.emissionservice.controller;

import com.misfat.emissionservice.entity.EmissionSource;
import com.misfat.emissionservice.service.EmissionSourceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
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

    @PostMapping
    public EmissionSource createSource(@RequestBody EmissionSource source) {
        return service.saveSource(source);
    }

    /** Modification depuis l'icône ✏️ du référentiel des sources. */
    @PutMapping("/{id}")
    public ResponseEntity<EmissionSource> updateSource(@PathVariable Long id,
                                                       @RequestBody EmissionSource source) {
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