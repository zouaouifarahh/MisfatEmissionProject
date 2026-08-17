package com.misfat.organizationservice.controller;

import com.misfat.organizationservice.dto.FilialeDTO;
import com.misfat.organizationservice.service.FilialeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * Gestion des sociétés du groupe.
 *
 * <p>Les erreurs métier sont traduites en codes HTTP explicites : l'écran de
 * gestion affiche le message renvoyé, il ne peut donc pas se contenter d'un 500
 * générique pour un code déjà pris ou une société encore rattachée à des
 * usines.</p>
 */
@RestController
@RequestMapping("/api/filiales")
public class FilialeController {

    @Autowired
    private FilialeService filialeService;

    @GetMapping
    public List<FilialeDTO> getAll() {
        return filialeService.getAllFiliales();
    }

    @GetMapping("/{id}")
    public ResponseEntity<FilialeDTO> getById(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(filialeService.getFilialeById(id));
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody FilialeDTO dto) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED).body(filialeService.createFiliale(dto));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody FilialeDTO dto) {
        try {
            return ResponseEntity.ok(filialeService.updateFiliale(id, dto));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id) {
        try {
            filialeService.deleteFiliale(id);
            return ResponseEntity.noContent().build();
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", e.getMessage()));
        }
    }
}
