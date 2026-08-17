package com.misfat.emissionservice.controller;

import com.misfat.emissionservice.entity.EmissionMeasure;
import com.misfat.emissionservice.service.EmissionMeasureService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/emission-measures")
@CrossOrigin(origins = "*")
public class EmissionMeasureController {

    @Autowired
    private EmissionMeasureService service;

    @PostMapping
    public ResponseEntity<EmissionMeasure> create(@RequestBody EmissionMeasure measure) {
        try {
            return ResponseEntity.ok(service.createMeasure(measure));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    // ✅ UNIQUE MÉTHODE GET pour récupérer toutes les mesures (avec ou sans filtre 'category')
    @GetMapping
    public ResponseEntity<List<EmissionMeasure>> getAll(@RequestParam(required = false) String category) {
        if (category != null && !category.isEmpty()) {
            return ResponseEntity.ok(service.getMeasuresByCategory(category));
        }
        return ResponseEntity.ok(service.getAllMeasures());
    }

    @GetMapping("/{id}")
    public ResponseEntity<EmissionMeasure> getById(@PathVariable Long id) {
        return service.getMeasureById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}")
    public ResponseEntity<EmissionMeasure> update(@PathVariable Long id, @RequestBody EmissionMeasure measure) {
        try {
            return service.updateMeasure(id, measure)
                    .map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        if (service.deleteMeasure(id)) {
            return ResponseEntity.ok().build();
        }
        return ResponseEntity.notFound().build();
    }
}