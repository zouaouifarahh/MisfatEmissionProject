package com.misfat.emissionservice.controller;

import com.misfat.emissionservice.entity.EmissionFactor;
import com.misfat.emissionservice.service.EmissionFactorService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/emission-factors")
@CrossOrigin(origins = "*")
public class EmissionFactorController {

    @Autowired
    private EmissionFactorService service;

    @PostMapping
    public ResponseEntity<EmissionFactor> create(@RequestBody EmissionFactor factor) {
        return ResponseEntity.ok(service.createFactor(factor));
    }

    @GetMapping
    public ResponseEntity<List<EmissionFactor>> getAll() {
        return ResponseEntity.ok(service.getAllFactors());
    }

    @GetMapping("/{id}")
    public ResponseEntity<EmissionFactor> getById(@PathVariable Long id) {
        return service.getFactorById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/search")
    public ResponseEntity<List<EmissionFactor>> search(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String emissionSource,
            @RequestParam(required = false) String dataType) {

        // Si aucun paramètre n'est renseigné, renvoyer tous les facteurs
        if (category == null && emissionSource == null && dataType == null) {
            return ResponseEntity.ok(service.getAllFactors());
        }

        return ResponseEntity.ok(service.searchFactors(category, emissionSource, dataType));
    }

    @PutMapping("/{id}")
    public ResponseEntity<EmissionFactor> update(@PathVariable Long id, @RequestBody EmissionFactor factor) {
        return service.updateFactor(id, factor)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        if (service.deleteFactor(id)) {
            return ResponseEntity.ok().build();
        }
        return ResponseEntity.notFound().build();
    }

    @GetMapping("/by-category")
    public ResponseEntity<List<EmissionFactor>> getByCategory(@RequestParam String category) {
        return ResponseEntity.ok(service.getFactorsByCategory(category));
    }
}