package com.misfat.dataimportservice.controller;

import com.misfat.dataimportservice.dto.ImportSourceTypeDTO;
import com.misfat.dataimportservice.service.ImportSourceTypeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/import-sources")
@RequiredArgsConstructor
public class ImportSourceTypeController {

    private final ImportSourceTypeService service;

    /** Tous les types ; {@code ?activeOnly=true} restreint aux types actifs. */
    @GetMapping
    public List<ImportSourceTypeDTO> getAll(
            @RequestParam(name = "activeOnly", defaultValue = "false") boolean activeOnly) {
        return activeOnly ? service.findAllActive() : service.findAll();
    }

    @GetMapping("/active")
    public List<ImportSourceTypeDTO> getActive() {
        return service.findAllActive();
    }

    @GetMapping("/scope/{scopeTarget}")
    public List<ImportSourceTypeDTO> getActiveByScope(@PathVariable String scopeTarget) {
        return service.findActiveByScope(scopeTarget);
    }

    @GetMapping("/{id}")
    public ImportSourceTypeDTO getById(@PathVariable Long id) {
        return service.findById(id);
    }

    @GetMapping("/code/{codeName}")
    public ImportSourceTypeDTO getByCodeName(@PathVariable String codeName) {
        return service.findByCodeName(codeName);
    }

    @PostMapping
    public ResponseEntity<ImportSourceTypeDTO> create(@Valid @RequestBody ImportSourceTypeDTO dto) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(dto));
    }

    @PutMapping("/{id}")
    public ImportSourceTypeDTO update(@PathVariable Long id, @Valid @RequestBody ImportSourceTypeDTO dto) {
        return service.update(id, dto);
    }

    /** Suppression logique : le type est désactivé, jamais retiré de la base. */
    @DeleteMapping("/{id}")
    public ImportSourceTypeDTO deactivate(@PathVariable Long id) {
        return service.deactivate(id);
    }

    @PatchMapping("/{id}/activate")
    public ImportSourceTypeDTO activate(@PathVariable Long id) {
        return service.activate(id);
    }
}
