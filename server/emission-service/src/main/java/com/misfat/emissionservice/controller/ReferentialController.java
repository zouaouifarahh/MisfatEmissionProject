package com.misfat.emissionservice.controller;

import com.misfat.emissionservice.dto.CategoryWithSourcesDTO;
import com.misfat.emissionservice.dto.SourceSansFacteurDTO;
import com.misfat.emissionservice.entity.CarbonReference;
import com.misfat.emissionservice.service.ReferentialService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

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
    /**
     * @param filialeId société consultée. Absent, la vue reste consolidée
     *                  groupe : tous les facteurs sont lisibles, publics comme
     *                  rattachés. Renseigné, seuls les publics et ceux de la
     *                  société remontent.
     */
    @GetMapping("/categories-with-sources")
    public List<CategoryWithSourcesDTO> categoriesWithSources(
            @RequestParam(required = false) Long filialeId) {
        return referentialService.categoriesAvecSources(filialeId);
    }

    /**
     * Sources qu'aucun facteur ne documente, toutes origines confondues.
     *
     * <p>Non filtrée par société : une source sans facteur est un manque du
     * référentiel, pas une donnée d'exploitation. La masquer selon le périmètre
     * consulté laisserait le trou invisible depuis la vue où on le comblerait.</p>
     */
    @GetMapping("/sources-sans-facteur")
    public List<SourceSansFacteurDTO> sourcesSansFacteur() {
        return referentialService.sourcesSansFacteur();
    }

    /**
     * Rattache une source déclarée au référentiel carbone, pour qu'elle puisse
     * recevoir un facteur.
     *
     * <p>Rend la référence — existante ou créée — dont l'écran a besoin pour
     * enchaîner sur la création du facteur.</p>
     */
    @PostMapping("/sources/{referenceCode}/rattacher")
    public ResponseEntity<Map<String, Object>> rattacher(@PathVariable String referenceCode) {
        try {
            CarbonReference reference = referentialService.rattacherAuReferentiel(referenceCode);
            return ResponseEntity.ok(Map.of(
                    "carbonReferenceId", reference.getId(),
                    "referenceCode", reference.getReferenceCode(),
                    "typeName", reference.getTypeName()));
        } catch (IllegalArgumentException introuvable) {
            return ResponseEntity.notFound().build();
        } catch (IllegalStateException incoherent) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", incoherent.getMessage()));
        }
    }
}
