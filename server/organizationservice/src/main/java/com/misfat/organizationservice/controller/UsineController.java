package com.misfat.organizationservice.controller;

import com.misfat.organizationservice.dto.UsineDTO;
import com.misfat.organizationservice.service.UsineService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/usines")
public class UsineController {

    @Autowired
    private UsineService usineService;

    @GetMapping
    public List<UsineDTO> getAll() {
        return usineService.getAllUsines();
    }

    @GetMapping("/filiale/{filialeId}")
    public List<UsineDTO> getByFiliale(@PathVariable Long filialeId) {
        return usineService.getUsinesByFiliale(filialeId);
    }

    @PostMapping
    public UsineDTO create(@RequestBody UsineDTO dto) {
        return usineService.createUsine(dto);
    }

    @PutMapping("/{id}")
    public UsineDTO update(@PathVariable Long id, @RequestBody UsineDTO dto) {
        return usineService.updateUsine(id, dto);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        usineService.deleteUsine(id);
    }
}