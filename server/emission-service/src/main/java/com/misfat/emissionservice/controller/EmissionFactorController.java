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

    /**
     * @param filialeId société consultée. Absent, tous les facteurs remontent —
     *                  c'est la vue consolidée groupe. Renseigné, seuls les
     *                  facteurs publics et ceux de la société sont rendus : un
     *                  ratio saisi pour MISFAT Tunisie n'a pas à valoriser le
     *                  bilan de MISFAT Maroc.
     */
    @GetMapping
    public ResponseEntity<List<EmissionFactor>> getAll(
            @RequestParam(required = false) Long filialeId) {
        return ResponseEntity.ok(service.getFactorsVisibles(filialeId));
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