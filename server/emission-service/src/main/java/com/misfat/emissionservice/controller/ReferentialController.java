package com.misfat.emissionservice.controller;

import com.misfat.emissionservice.dto.CategoryWithSourcesDTO;
import com.misfat.emissionservice.service.ReferentialService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Référentiel carbone exposé aux écrans de saisie. */
@RestController
@RequestMapping("/api/v1/referential")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class ReferentialController {

    private final ReferentialService referentialService;

    /**
     * Arborescence scope → catégorie → source, chaque source portant son unité
     * imposée et son facteur d'émission par défaut.
     */
    @GetMapping("/categories-with-sources")
    public List<CategoryWithSourcesDTO> categoriesWithSources() {
        return referentialService.categoriesAvecSources();
    }
}
